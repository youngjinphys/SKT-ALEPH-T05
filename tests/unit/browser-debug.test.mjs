import test from 'node:test';
import assert from 'node:assert/strict';

import {
  firstReachableDebugBase,
  loopbackDebugBases,
  parseChromeDriverSession,
  parseDevToolsActivePort,
} from '../../scripts/browser-debug.mjs';

test('parses a dynamic DevToolsActivePort file', () => {
  assert.deepEqual(
    parseDevToolsActivePort('40319\n/devtools/browser/abc-123\n'),
    { port: 40319, browserPath: '/devtools/browser/abc-123' },
  );
});

test('rejects malformed DevToolsActivePort data', () => {
  assert.throws(() => parseDevToolsActivePort('not-a-port\n/devtools/browser/abc'), /Invalid DevToolsActivePort/);
  assert.throws(() => parseDevToolsActivePort('9222\n/not-devtools'), /Invalid DevTools browser path/);
});

test('probes both IPv4 and IPv6 loopback addresses', () => {
  assert.deepEqual(loopbackDebugBases(9222), ['http://127.0.0.1:9222', 'http://[::1]:9222']);
});

test('falls back to IPv6 when Chrome is not listening on IPv4', async () => {
  const visited = [];
  const request = async (url) => {
    visited.push(url);
    if (url.startsWith('http://127.0.0.1')) throw new Error('ECONNREFUSED');
    return { ok: true, status: 200 };
  };

  const base = await firstReachableDebugBase(9222, request);
  assert.equal(base, 'http://[::1]:9222');
  assert.deepEqual(visited, [
    'http://127.0.0.1:9222/json/version',
    'http://[::1]:9222/json/version',
  ]);
});

test('parses a W3C ChromeDriver session and exposes its debugger address', () => {
  assert.deepEqual(
    parseChromeDriverSession({
      value: {
        sessionId: 'session-123',
        capabilities: {
          browserName: 'chrome',
          'goog:chromeOptions': { debuggerAddress: 'localhost:43871' },
        },
      },
    }),
    { sessionId: 'session-123', debuggerAddress: 'localhost:43871' },
  );
});

test('rejects ChromeDriver sessions that cannot provide a CDP endpoint', () => {
  assert.throws(
    () => parseChromeDriverSession({ value: { sessionId: 'session-123', capabilities: {} } }),
    /debugger address/i,
  );
  assert.throws(
    () => parseChromeDriverSession({ value: { error: 'session not created', message: 'browser failed' } }),
    /session not created/i,
  );
});
