import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const productionRoots = ['src'];
const syntaxRoots = ['src', 'scripts', 'tests'];
const failures = [];

async function walk(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(child));
    else paths.push(child);
  }
  return paths;
}

for (const directory of syntaxRoots) {
  for (const path of await walk(directory)) {
    if (!['.js', '.mjs'].includes(extname(path))) continue;
    const result = spawnSync(process.execPath, ['--check', join(root, path)], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(`${path}: JavaScript syntax check failed\n${result.stderr.trim()}`);
  }
}

const forbiddenProductionPatterns = [
  [/\binnerHTML\b/u, 'innerHTML is forbidden in production source'],
  [/\binsertAdjacentHTML\b/u, 'insertAdjacentHTML is forbidden in production source'],
  [/\beval\s*\(/u, 'eval() is forbidden in production source'],
  [/\bnew\s+Function\b/u, 'new Function is forbidden in production source'],
  [/\blocalStorage\b/u, 'localStorage is forbidden by the default privacy model'],
  [/\bsessionStorage\b/u, 'sessionStorage is forbidden by the default privacy model'],
  [/\bfetch\s*\(/u, 'runtime network fetch is forbidden by the local-only privacy model'],
  [/\bXMLHttpRequest\b/u, 'XMLHttpRequest is forbidden by the local-only privacy model'],
  [/\bWebSocket\b/u, 'WebSocket is forbidden by the local-only privacy model'],
  [/https?:\/\//u, 'external HTTP(S) URL is forbidden in production source'],
];

for (const directory of productionRoots) {
  for (const path of await walk(directory)) {
    if (!['.js', '.css'].includes(extname(path))) continue;
    const content = await readFile(join(root, path), 'utf8');
    for (const [pattern, message] of forbiddenProductionPatterns) {
      if (pattern.test(content)) failures.push(`${path}: ${message}`);
    }
  }
}

const html = await readFile(join(root, 'index.html'), 'utf8');
if (!/accept="\.png,\.jpeg"/u.test(html)) failures.push('index.html: file input must advertise exactly .png,.jpeg');
if (/accept="[^"]*\.jpg/u.test(html)) failures.push('index.html: .jpg must not appear in the file input accept list');
if (!/connect-src 'none'/u.test(html)) failures.push("index.html: CSP must block network connections with connect-src 'none'");
if (!/script-src 'self'/u.test(html)) failures.push("index.html: CSP must restrict scripts to 'self'");
if (!/object-src 'none'/u.test(html)) failures.push("index.html: CSP must disable object embedding");
if (/\son[a-z]+\s*=/iu.test(html)) failures.push('index.html: inline event handlers are forbidden');
if (/<script(?![^>]*\bsrc=)[^>]*>/iu.test(html)) failures.push('index.html: inline scripts are forbidden');
if (/https?:\/\//iu.test(html)) failures.push('index.html: external HTTP(S) resources are forbidden');

if (failures.length) {
  console.error(`Static checks failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Static checks passed: syntax, local-only privacy constraints, CSP, and upload allowlist.');
