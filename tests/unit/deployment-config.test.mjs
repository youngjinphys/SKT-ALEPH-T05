import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vercelText = await readFile(new URL('../../vercel.json', import.meta.url), 'utf8').catch(() => '{}');
const vercel = JSON.parse(vercelText);
const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const ci = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

const expectedSecurityHeaders = new Map([
  ['Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'"],
  ['Referrer-Policy', 'no-referrer'],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
]);

test('Vercel deploys the same dist directory produced by the build script', () => {
  assert.equal(vercel.outputDirectory, 'dist');
  assert.equal(vercel.buildCommand, 'npm run build');
});

test('Vercel sends the security headers relied upon by the privacy model', () => {
  const wildcard = vercel.headers?.find((entry) => entry.source === '/(.*)');
  assert.ok(wildcard, 'expected a wildcard Vercel header rule');
  const actual = new Map(wildcard.headers.map(({ key, value }) => [key, value]));
  for (const [key, value] of expectedSecurityHeaders) assert.equal(actual.get(key), value, `${key} must match`);
});

test('Vercel and CI use one pinned Node major', () => {
  assert.equal(pkg.engines?.node, '24.x');
  assert.match(ci, /node-version:\s*24\b/u);
});

test('CI provisions Korean glyph coverage for Canvas interaction tests', () => {
  assert.match(ci, /fonts-noto-cjk/u);
});

test('CI uses current Node 24-native GitHub Actions majors', () => {
  assert.match(ci, /actions\/checkout@v7\b/u);
  assert.match(ci, /actions\/setup-node@v7\b/u);
});
