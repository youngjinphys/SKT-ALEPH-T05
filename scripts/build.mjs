import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, 'index.html'), join(dist, 'index.html'));
await cp(join(root, 'src'), join(dist, 'src'), { recursive: true });

const index = await readFile(join(dist, 'index.html'), 'utf8');
for (const required of ['./src/main.js', './src/styles.css', 'accept=".png,.jpeg"']) {
  if (!index.includes(required)) throw new Error(`Build verification failed: missing ${required}`);
}

const headers = `/*\n  Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n`;
await writeFile(join(dist, '_headers'), headers, 'utf8');
console.log('Build complete: dist/ contains the static application and deployment security headers.');
