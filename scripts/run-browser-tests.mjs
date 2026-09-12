import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firstReachableDebugBase, parseChromeDriverSession, waitForDevTools } from './browser-debug.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profile = await mkdtemp(join(tmpdir(), 'aleph-chrome-'));
const children = [];
const moduleCache = new Map();

function resolveBrowserBinary() {
  if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN;
  for (const candidate of ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome']) {
    if (spawnSync('which', [candidate], { stdio: 'ignore' }).status === 0) return candidate;
  }
  throw new Error('Chromium/Chrome was not found. Set CHROMIUM_BIN to run browser integration tests.');
}

function resolveChromeDriverBinary() {
  if (process.env.CHROMEDRIVER_BIN) return process.env.CHROMEDRIVER_BIN;
  return spawnSync('which', ['chromedriver'], { encoding: 'utf8' }).stdout.trim() || null;
}

function start(command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

async function waitForHttp(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function createChromeDriverSession(driverBase) {
  const response = await fetch(`${driverBase}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: {
          browserName: 'chrome',
          'goog:chromeOptions': {
            args: [
              '--headless=new',
              '--no-sandbox',
              '--disable-gpu',
              '--disable-dev-shm-usage',
              '--disable-background-networking',
              '--disable-default-apps',
              '--disable-extensions',
              '--disable-sync',
              '--no-proxy-server',
            ],
          },
        },
      },
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    const detail = payload?.value?.message ?? JSON.stringify(payload);
    throw new Error(`ChromeDriver session creation failed (HTTP ${response.status}): ${detail}`);
  }
  return parseChromeDriverSession(payload);
}

async function findPageTarget(debugBase) {
  const response = await fetch(`${debugBase}/json/list`);
  if (!response.ok) throw new Error(`DevTools target listing returned HTTP ${response.status}.`);
  const targets = await response.json();
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (page) return page;

  const createResponse = await fetch(`${debugBase}/json/new?about:blank`, { method: 'PUT' });
  if (!createResponse.ok) throw new Error(`DevTools target creation returned HTTP ${createResponse.status}.`);
  return createResponse.json();
}

async function moduleDataUrl(filePath) {
  const absolutePath = resolve(filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath);
  let source = await readFile(absolutePath, 'utf8');
  const importPattern = /((?:from\s+)|(?:import\s+))["'](\.{1,2}\/[^"']+)["']/g;
  const replacements = [];
  for (const match of source.matchAll(importPattern)) {
    const dependencyPath = resolve(dirname(absolutePath), match[2]);
    const dependencyUrl = await moduleDataUrl(dependencyPath);
    replacements.push({ start: match.index + match[1].length, end: match.index + match[0].length, url: dependencyUrl });
  }
  for (const replacement of replacements.reverse()) {
    source = `${source.slice(0, replacement.start)}"${replacement.url}"${source.slice(replacement.end)}`;
  }
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  moduleCache.set(absolutePath, dataUrl);
  return dataUrl;
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener('open', resolvePromise, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Runtime evaluation failed';
    throw new Error(detail);
  }
  return result.result.value;
}

async function waitForResults(client) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await evaluate(client, 'window.__ALEPH_TEST_RESULTS__ ?? null');
    if (result) return result;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error('Timed out waiting for browser integration results.');
}

try {
  let browserCleanup = async () => {};
  let browserErrors = '';
  let debugBase;
  const chromeDriverBinary = resolveChromeDriverBinary();

  if (chromeDriverBinary) {
    const driverBase = 'http://127.0.0.1:9515';
    const driver = start(chromeDriverBinary, ['--port=9515', '--log-level=WARNING']);
    driver.stderr.on('data', (chunk) => { browserErrors += chunk.toString(); });
    driver.stdout.on('data', (chunk) => { browserErrors += chunk.toString(); });
    try {
      await waitForHttp(`${driverBase}/status`);
      const session = await createChromeDriverSession(driverBase);
      const port = Number(new URL(`http://${session.debuggerAddress}`).port);
      debugBase = await firstReachableDebugBase(port);
      browserCleanup = async () => {
        await fetch(`${driverBase}/session/${encodeURIComponent(session.sessionId)}`, { method: 'DELETE' }).catch(() => {});
        if (!driver.killed) driver.kill('SIGTERM');
        if (driver.exitCode === null) await new Promise((resolvePromise) => driver.once('exit', resolvePromise));
      };
    } catch (error) {
      const detail = browserErrors.trim();
      throw new Error(`${error.message}${detail ? `
ChromeDriver output:
${detail}` : ''}`);
    }
  } else {
    const chrome = start(resolveBrowserBinary(), [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--no-proxy-server',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ]);
    chrome.stderr.on('data', (chunk) => { browserErrors += chunk.toString(); });

    const devTools = await waitForDevTools({
      profile,
      browserProcess: chrome,
      stderr: () => browserErrors,
    });
    debugBase = devTools.base;
    browserCleanup = async () => {
      if (!chrome.killed) chrome.kill('SIGTERM');
      if (chrome.exitCode === null) await new Promise((resolvePromise) => chrome.once('exit', resolvePromise));
    };
  }

  const target = await findPageTarget(debugBase);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  await client.send('Runtime.enable');
  await client.send('Page.enable');

  const rawHtml = await readFile(join(root, 'index.html'), 'utf8');
  const css = await readFile(join(root, 'src/styles.css'), 'utf8');
  const html = rawHtml
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '')
    .replace(/<link rel="stylesheet"[^>]*>/i, `<style>${css}</style>`)
    .replace(/<script type="module" src="\.\/src\/main\.js"><\/script>/i, '');
  const frameTree = await client.send('Page.getFrameTree');
  await client.send('Page.setDocumentContent', { frameId: frameTree.frameTree.frame.id, html });

  const mainUrl = await moduleDataUrl(join(root, 'src/main.js'));
  await evaluate(client, `import(${JSON.stringify(mainUrl)})`);
  const e2eUrl = await moduleDataUrl(join(root, 'tests/browser/browser-e2e.js'));
  await evaluate(client, `import(${JSON.stringify(e2eUrl)})`);
  const result = await waitForResults(client);

  const resultsDir = join(root, 'test-results');
  await mkdir(resultsDir, { recursive: true });

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1365,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(client, 'window.scrollTo(0, 0)');
  const desktopScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(resultsDir, 'desktop.png'), Buffer.from(desktopScreenshot.data, 'base64'));

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate(client, 'window.scrollTo(0, 0)');
  const mobileOverflow = await evaluate(client, 'document.documentElement.scrollWidth > window.innerWidth + 1');
  if (mobileOverflow) result.failures.push('mobile layout has horizontal overflow');
  else result.assertions += 1;
  result.status = result.failures.length ? 'fail' : 'pass';
  const mobileScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(resultsDir, 'mobile.png'), Buffer.from(mobileScreenshot.data, 'base64'));

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 568,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate(client, 'window.scrollTo(0, 0)');
  const compactOverflow = await evaluate(client, 'document.documentElement.scrollWidth > window.innerWidth + 1');
  if (compactOverflow) result.failures.push('320px compact mobile layout has horizontal overflow');
  else result.assertions += 1;
  result.status = result.failures.length ? 'fail' : 'pass';

  console.log(JSON.stringify(result, null, 2));
  client.close();
  if (result.status !== 'pass') {
    console.error(browserErrors.split('\n').filter((line) => /Refused|CONSOLE|ERROR|error/i.test(line)).slice(-40).join('\n'));
    process.exitCode = 1;
  }

  await browserCleanup();
} finally {
  stopAll();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
