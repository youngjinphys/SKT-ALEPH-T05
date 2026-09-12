import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function parseDevToolsActivePort(content) {
  const [portLine, browserPath = ''] = String(content).trim().split(/\r?\n/u);
  const port = Number(portLine);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid DevToolsActivePort value: ${portLine || '<empty>'}`);
  }
  if (browserPath && !browserPath.startsWith('/devtools/browser/')) {
    throw new Error(`Invalid DevTools browser path: ${browserPath}`);
  }
  return { port, browserPath };
}

export function loopbackDebugBases(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('A valid TCP port is required.');
  return [`http://127.0.0.1:${port}`, `http://[::1]:${port}`];
}

export function parseChromeDriverSession(payload) {
  const value = payload?.value;
  if (value?.error) {
    throw new Error(`ChromeDriver ${value.error}: ${value.message || 'session creation failed'}`);
  }

  const sessionId = value?.sessionId;
  const debuggerAddress = value?.capabilities?.['goog:chromeOptions']?.debuggerAddress;
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new Error('ChromeDriver response did not include a session id.');
  }
  if (typeof debuggerAddress !== 'string' || !debuggerAddress) {
    throw new Error('ChromeDriver response did not include a debugger address.');
  }
  return { sessionId, debuggerAddress };
}

export async function firstReachableDebugBase(port, request = fetch) {
  let lastError;
  for (const base of loopbackDebugBases(port)) {
    try {
      const response = await request(`${base}/json/version`);
      if (response.ok) return base;
      lastError = new Error(`DevTools endpoint ${base} returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('No DevTools loopback endpoint is reachable.');
}

export async function waitForDevTools({ profile, browserProcess, stderr = () => '', timeoutMs = 10000 }) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  const activePortPath = join(profile, 'DevToolsActivePort');

  while (Date.now() < deadline) {
    if (browserProcess.exitCode !== null) {
      const detail = stderr().trim();
      throw new Error(`Browser exited before DevTools became ready (exit ${browserProcess.exitCode}).${detail ? `\n${detail}` : ''}`);
    }

    try {
      const activePort = parseDevToolsActivePort(await readFile(activePortPath, 'utf8'));
      const base = await firstReachableDebugBase(activePort.port);
      return { ...activePort, base };
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }

  const detail = stderr().trim();
  const cause = lastError ? ` Last probe: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for Chrome DevTools.${cause}${detail ? `\nChrome stderr:\n${detail}` : ''}`);
}
