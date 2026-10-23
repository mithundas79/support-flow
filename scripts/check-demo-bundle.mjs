import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve('apps/web/dist');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : join(directory, entry.name)))).flat();
}
const checks = [
  ['OpenAI credential', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['Slack credential', /\bxox[baprs]-[A-Za-z0-9-]{20,}/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['direct provider endpoint', /https:\/\/(?:api\.openai\.com|gmail\.googleapis\.com|slack\.com\/api)\b/],
];
const failures = [];
let scanned = 0;
for (const file of await files(root)) {
  if (!/\.(?:html|js|css|json|map)$/.test(file)) continue;
  const content = await readFile(file, 'utf8');
  scanned++;
  for (const [name, pattern] of checks) if (pattern.test(content)) failures.push(`${name} matched in ${file.slice(root.length + 1)}`);
}
const html = await readFile(join(root, 'index.html'), 'utf8');
if (!html.includes('/support-flow/assets/')) failures.push('Pages asset base must be /support-flow/assets/.');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`Public bundle checks passed across ${scanned} text assets; no credential patterns or direct provider endpoints matched.`);
