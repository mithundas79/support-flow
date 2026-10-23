import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { validateManifest, verifyPublishedDemo } from './verify-published-demo.mjs';

const contents = {
  'index.html': Buffer.from('<html>Fictional sample — no sends\r\n</html>'),
  'assets/app-123.js': Buffer.from('console.log("fictional sample");\r\n'),
  'assets/app-123.css': Buffer.from('body { color: #123; }\r\n'),
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
const fixtureOptions = { allowHttpLoopback: true, attempts: 1, retryDelayMs: 0, requestTimeoutMs: 1000, maxDurationMs: 5000 };

async function fixture(t, override) {
  const calls = [];
  const server = createServer((request, response) => {
    const path = request.url === '/support-flow/' ? 'index.html' : request.url.slice('/support-flow/'.length);
    calls.push(request.url);
    if (override?.(path, response, calls) === true) return;
    if (!Object.hasOwn(contents, path)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200);
    response.end(contents[path]);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const manifest = {
    baseUrl: `http://127.0.0.1:${server.address().port}/support-flow/`,
    sourceCommit: 'a'.repeat(40), sourceRunId: '12345', sourceArtifactId: 67890,
    files: Object.entries(contents).map(([path, body]) => ({ path, sha256: digest(body) })),
  };
  return { manifest, calls };
}

test('verifies actual HTTP HTML/JS/CSS bytes and preserves artifact provenance', async (t) => {
  const { manifest, calls } = await fixture(t);
  const report = await verifyPublishedDemo(manifest, fixtureOptions);
  assert.equal(report.fileCount, 3);
  assert.equal(report.sourceCommit, manifest.sourceCommit);
  assert.equal(report.sourceRunId, '12345');
  assert.equal(report.sourceArtifactId, '67890');
  assert.equal(report.totalFetchedBytes, Object.values(contents).reduce((total, body) => total + body.byteLength, 0));
  assert.deepEqual(calls, ['/support-flow/', '/support-flow/assets/app-123.js', '/support-flow/assets/app-123.css']);
  assert.ok(report.files.every((file) => file.attempts === 1));
});

test('actual hash mismatch fails after the bounded retry count', async (t) => {
  const { manifest, calls } = await fixture(t, (path, response) => {
    if (!path.endsWith('.js')) return false;
    response.end('stale deployed JavaScript'); return true;
  });
  await assert.rejects(verifyPublishedDemo(manifest, { ...fixtureOptions, attempts: 2 }), /app-123\.js failed after 2 attempt\(s\): SHA-256 mismatch/);
  assert.equal(calls.filter((path) => path.endsWith('.js')).length, 2);
});

test('a cache mismatch can succeed on the next bounded attempt', async (t) => {
  let first = true;
  const { manifest } = await fixture(t, (path, response) => {
    if (!path.endsWith('.js') || !first) return false;
    first = false; response.end('previous artifact'); return true;
  });
  const report = await verifyPublishedDemo(manifest, { ...fixtureOptions, attempts: 2 });
  assert.equal(report.files.find((file) => file.path.endsWith('.js')).attempts, 2);
});

test('missing assets fail with their HTTP status', async (t) => {
  const { manifest, calls } = await fixture(t, (path, response) => {
    if (!path.endsWith('.css')) return false;
    response.writeHead(404); response.end(); return true;
  });
  await assert.rejects(verifyPublishedDemo(manifest, { ...fixtureOptions, attempts: 2 }), /app-123\.css failed after 2 attempt\(s\): HTTP 404/);
  assert.equal(calls.filter((path) => path.endsWith('.css')).length, 2);
});

test('invalid provenance and paths are rejected before any HTTP request', async (t) => {
  const { manifest, calls } = await fixture(t);
  for (const path of ['../outside.js', '/outside.js', 'assets/../../outside.js', 'assets/%2e%2e/outside.js', 'assets\\outside.js', 'https://example.test/outside.js', 'assets/app.js?query', 'assets//app.js']) {
    assert.throws(() => validateManifest({ ...manifest, files: [{ ...manifest.files[0], path }, ...manifest.files.slice(1)] }, fixtureOptions));
  }
  for (const invalid of [
    { sourceCommit: 'not-a-commit' }, { sourceRunId: 0 }, { sourceArtifactId: 'invalid' },
    { baseUrl: manifest.baseUrl.replace('http://', 'http://token@') },
    { files: [...manifest.files, manifest.files[0]] },
    { files: manifest.files.map((entry) => ({ ...entry, sha256: 'not-a-hash' })) },
    { files: manifest.files.filter((entry) => !entry.path.endsWith('.css')) },
  ]) assert.throws(() => validateManifest({ ...manifest, ...invalid }, fixtureOptions));
  assert.throws(() => validateManifest(manifest), /HTTPS/);
  assert.equal(calls.length, 0);
});

test('redirects are rejected without following an outside-base location', async (t) => {
  const { manifest, calls } = await fixture(t, (path, response) => {
    if (!path.endsWith('.js')) return false;
    response.writeHead(302, { location: '/outside.js' }); response.end(); return true;
  });
  await assert.rejects(verifyPublishedDemo(manifest, { ...fixtureOptions, attempts: 3 }), /Redirect rejected/);
  assert.equal(calls.filter((path) => path.endsWith('.js')).length, 1);
  assert.ok(!calls.includes('/outside.js'));
});

test('streamed responses are capped even without Content-Length', async (t) => {
  const { manifest } = await fixture(t, (path, response) => {
    if (!path.endsWith('.js')) return false;
    response.writeHead(200); response.write(Buffer.alloc(70)); response.end(Buffer.alloc(70)); return true;
  });
  await assert.rejects(verifyPublishedDemo(manifest, { ...fixtureOptions, maxFileBytes: 100 }), /per-file byte limit/);
});

test('total transfer budget includes bytes from unsuccessful cache attempts', async (t) => {
  let first = true;
  const { manifest } = await fixture(t, (path, response) => {
    if (!path.endsWith('.js') || !first) return false;
    first = false; response.end('previous artifact'); return true;
  });
  const exactArtifactBytes = Object.values(contents).reduce((total, body) => total + body.byteLength, 0);
  await assert.rejects(verifyPublishedDemo(manifest, { ...fixtureOptions, attempts: 2, maxTotalBytes: exactArtifactBytes }), /total byte limit, including retries/);
});

test('a slow response body is bounded by the request timeout', async (t) => {
  const { manifest } = await fixture(t, (path, response) => {
    if (!path.endsWith('.js')) return false;
    response.writeHead(200); response.write('partial body'); return true;
  });
  await assert.rejects(verifyPublishedDemo(manifest, { ...fixtureOptions, requestTimeoutMs: 250 }), /app-123\.js failed after 1 attempt/);
});
