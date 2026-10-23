/**
 * Usage: node scripts/verify-published-demo.mjs docs/demo-release.json
 * Manifest: {baseUrl, sourceCommit, sourceRunId, sourceArtifactId,
 *            files:[{path, sha256}]}. IDs are positive integers or digit strings.
 * Paths are artifact-relative. index.html is checked at the public directory URL.
 * Extra provenance fields are allowed. Output is a JSON verification report.
 * CLI requires HTTPS; allowHttpLoopback exists only for local fixture tests.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULTS = Object.freeze({
  attempts: 3, retryDelayMs: 2_000, requestTimeoutMs: 10_000,
  maxDurationMs: 120_000, maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
});
const fail = (message) => { throw new Error(message); };

export function validateManifest(input, { allowHttpLoopback = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Manifest must be an object.');
  if (typeof input.baseUrl !== 'string' || input.baseUrl.length > 2048) fail('baseUrl is required.');
  let base;
  try { base = new URL(input.baseUrl); } catch { fail('baseUrl must be an absolute URL.'); }
  const localHttp = allowHttpLoopback && base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !localHttp) fail('baseUrl must use HTTPS.');
  if (base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/') || base.pathname.includes('%') || base.href !== input.baseUrl) {
    fail('baseUrl must be canonical, end in /, and contain no credentials, query, fragment or encoded path.');
  }
  if (typeof input.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(input.sourceCommit)) fail('sourceCommit must be a 40-character Git commit SHA.');
  const ids = {};
  for (const key of ['sourceRunId', 'sourceArtifactId']) {
    const value = input[key];
    if (!(typeof value === 'string' && /^[1-9][0-9]{0,24}$/.test(value)) && !(Number.isSafeInteger(value) && value > 0)) fail(`${key} must be a positive integer or digit string.`);
    ids[key] = String(value);
  }
  if (!Array.isArray(input.files) || input.files.length < 3 || input.files.length > 256) fail('files must contain 3 to 256 artifact entries.');
  const seen = new Set();
  const files = input.files.map((entry) => {
    if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || entry.path.length > 1024 || !/^[A-Za-z0-9._-][A-Za-z0-9._/-]*$/.test(entry.path)) fail('Each file path must be a plain relative artifact path.');
    if (entry.path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) fail(`Unsafe file path: ${entry.path}`);
    const url = new URL(entry.path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) fail('A file path escapes baseUrl.');
    if (seen.has(entry.path)) fail(`Duplicate file path: ${entry.path}`);
    seen.add(entry.path);
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(entry.sha256)) fail(`Invalid SHA-256 for ${entry.path}`);
    return { path: entry.path, sha256: entry.sha256.toLowerCase(), url: entry.path === 'index.html' ? base.href : url.href };
  });
  if (!seen.has('index.html') || !files.some((entry) => entry.path.endsWith('.js')) || !files.some((entry) => entry.path.endsWith('.css'))) fail('The manifest must include index.html, JavaScript and CSS.');
  return { baseUrl: base.href, sourceCommit: input.sourceCommit.toLowerCase(), ...ids, files };
}

class StopVerification extends Error {}

export async function verifyPublishedDemo(input, options = {}) {
  const manifest = validateManifest(input, options);
  const settings = { ...DEFAULTS, ...options };
  for (const key of Object.keys(DEFAULTS)) {
    if (!Number.isSafeInteger(settings[key]) || settings[key] < (key === 'retryDelayMs' ? 0 : 1)) fail(`Invalid verifier option: ${key}`);
  }
  if (settings.attempts > 5 || settings.requestTimeoutMs > 30_000 || settings.maxDurationMs > 300_000 || settings.maxFileBytes > 20 * 1024 * 1024 || settings.maxTotalBytes > 100 * 1024 * 1024) fail('Verifier options exceed bounded limits.');
  const deadline = Date.now() + settings.maxDurationMs;
  let totalFetchedBytes = 0;
  const files = [];
  const checkTime = () => { if (Date.now() >= deadline) throw new StopVerification('Overall verification deadline exceeded.'); };

  for (const file of manifest.files) {
    let verified;
    for (let attempt = 1; attempt <= settings.attempts; attempt++) {
      checkTime();
      try {
        const response = await fetch(file.url, {
          redirect: 'manual', cache: 'no-store',
          headers: { 'accept-encoding': 'identity', 'cache-control': 'no-cache' },
          signal: AbortSignal.timeout(Math.max(1, Math.min(settings.requestTimeoutMs, deadline - Date.now()))),
        });
        if (response.status !== 200) {
          await response.body?.cancel();
          if (response.status >= 300 && response.status < 400) throw new StopVerification(`Redirect rejected for ${file.path}.`);
          throw new Error(`HTTP ${response.status}`);
        }
        const announced = Number(response.headers.get('content-length'));
        if (Number.isFinite(announced) && announced > settings.maxFileBytes) {
          await response.body?.cancel();
          throw new StopVerification(`Response exceeds per-file byte limit for ${file.path}.`);
        }
        let bytes = 0;
        const hash = createHash('sha256');
        // Hash byte buffers directly: no text decoding, newline normalization or
        // reliance on Content-Length (which may be absent or compressed).
        for await (const chunk of response.body ?? []) {
          bytes += chunk.byteLength;
          totalFetchedBytes += chunk.byteLength;
          if (bytes > settings.maxFileBytes) throw new StopVerification(`Response exceeds per-file byte limit for ${file.path}.`);
          if (totalFetchedBytes > settings.maxTotalBytes) throw new StopVerification('Responses exceed total byte limit, including retries.');
          hash.update(chunk);
          checkTime();
        }
        const actual = hash.digest('hex');
        if (actual !== file.sha256) throw new Error(`SHA-256 mismatch; expected ${file.sha256}, received ${actual}`);
        verified = { path: file.path, sha256: actual, bytes, attempts: attempt };
        break;
      } catch (error) {
        if (error instanceof StopVerification) throw error;
        checkTime();
        if (attempt === settings.attempts) throw new Error(`${file.path} failed after ${attempt} attempt(s): ${error.message}`);
        await delay(Math.min(settings.retryDelayMs, Math.max(0, deadline - Date.now())));
      }
    }
    files.push(verified);
  }
  return {
    baseUrl: manifest.baseUrl, sourceCommit: manifest.sourceCommit,
    sourceRunId: manifest.sourceRunId, sourceArtifactId: manifest.sourceArtifactId,
    verifiedAt: new Date().toISOString(), fileCount: files.length, totalFetchedBytes, files,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node scripts/verify-published-demo.mjs docs/demo-release.json\nRequired manifest fields: baseUrl, sourceCommit, sourceRunId, sourceArtifactId, files[{path,sha256}].\nRequires HTTPS; verifies index.html at baseUrl and every listed asset. Limits: 256 files, 5 MiB/file, 50 MiB total, 3 attempts/file, 10 seconds/request, 120 seconds overall.');
    return;
  }
  if (args.length !== 1) fail('Usage: node scripts/verify-published-demo.mjs docs/demo-release.json');
  const path = resolve(args[0]);
  if ((await stat(path)).size > 1024 * 1024) fail('Manifest exceeds 1 MiB.');
  const report = await verifyPublishedDemo(JSON.parse(await readFile(path, 'utf8')));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Published demo verification failed: ${error.message}`); process.exitCode = 1; });
}
