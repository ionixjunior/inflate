#!/usr/bin/env node
/**
 * T60 clean-profile smoke test (P1-H Independent Test): "install VSIX -> open fixture layout ->
 * guided flow completes -> render appears; then disable network -> renders still work."
 *
 * A literal fresh user account isn't available in CI, so this exercises the REAL production code
 * path as closely as possible instead of faking it: a brand-new (temp) globalStorage dir (no
 * pre-existing engine cache, exactly like a clean profile), the REAL JdkLocator (auto-detects this
 * machine's JDK — no `inflate.javaHome` override), the REAL ArtifactManager against the bundled
 * `engine-manifest.json` and the REAL packaged `host.jar` (built by `npm run package` at the repo
 * root), doing a REAL download from Google Maven (~170 MB, P1-H AC1), then a REAL render through
 * the packaged fat-jar. It then re-runs `ensureInstalled()` with a downloader that fails the run if
 * it is ever called, and renders again (offline-capable, P1-H AC1 "subsequent runs work offline").
 *
 * CI runs it on every runner (AD-028), after `npm run package` at the repo root:
 * `cd extension && npm run compile-tests && node out/test/smoke.js`.
 * - `INFLATE_SMOKE_PROFILE_PARENT`: the folder the clean profile is created in (default: the OS
 *   temp folder); CI on Windows passes a long one.
 * - `INFLATE_SMOKE_LONGEST_PATH_ABOVE`: fails the run unless the longest engine file path is longer
 *   than this many characters.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ArtifactManager, EngineManifest, hostArchFor, unsupportedPlatformMessage } from '../artifacts';
import { buildJavaCommand } from '../host';
import { isGuidedError, JdkLocator } from '../jdk';

const EXTENSION_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(EXTENSION_DIR, '..');

function log(msg: string): void {
  console.log(`[smoke] ${msg}`);
}

interface HostFrame {
  jsonrpc: '2.0';
  id: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message: string };
}

function spawnAndRender(
  javaBin: string,
  hostJarPath: string,
  args: string[],
  initializeParams: Record<string, unknown>,
  renderRequest: Record<string, unknown>,
): Promise<{ status: string; pngPath?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process') as typeof import('child_process');
    const child = spawn(javaBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = Buffer.alloc(0);
    let nextId = 1;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

    child.stderr.on('data', (d: Buffer) => process.stderr.write(`[host] ${d}`));
    child.on('error', reject);

    function send(method: string, params: unknown): Promise<unknown> {
      const id = nextId++;
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      const header = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n`;
      child.stdin.write(header + payload);
      return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
    }

    child.stdout.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const headerEnd = buf.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const m = buf.slice(0, headerEnd).toString('utf8').match(/Content-Length: (\d+)/i);
        if (!m) return;
        const len = parseInt(m[1], 10);
        const bodyStart = headerEnd + 4;
        if (buf.length < bodyStart + len) return;
        const body = buf.slice(bodyStart, bodyStart + len).toString('utf8');
        buf = buf.slice(bodyStart + len);
        const msg = JSON.parse(body) as HostFrame;
        const p = pending.get(msg.id);
        if (!p) continue;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      }
    });

    (async () => {
      await send('initialize', initializeParams);
      await send('warmup', {});
      const result = (await send('render', renderRequest)) as {
        status: string;
        pngPath?: string;
        error?: { message: string };
      };
      await send('shutdown', {});
      setTimeout(() => child.kill(), 300);
      resolve({ status: result.status, pngPath: result.pngPath, error: result.error?.message });
    })().catch(reject);
  });
}

async function main(): Promise<void> {
  const hostJarPath = path.join(EXTENSION_DIR, 'host.jar');
  if (!fs.existsSync(hostJarPath)) {
    throw new Error(`${hostJarPath} not found — run "npm run package" at the repo root first.`);
  }

  log('Detecting JDK (real JdkLocator, no inflate.javaHome override)...');
  const jdkLocator = new JdkLocator();
  const jdkResult = jdkLocator.locate(undefined);
  if (isGuidedError(jdkResult)) {
    throw new Error(`No JDK found: ${jdkResult.message} (guided setup would show this to the user)`);
  }
  log(`JDK found: ${jdkResult.home} (v${jdkResult.version}, source=${jdkResult.source})`);

  const manifest: EngineManifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, 'engine-manifest.json'), 'utf8'));
  const arch = hostArchFor(process.platform, process.arch);
  if (!arch) throw new Error(unsupportedPlatformMessage(process.platform, process.arch));
  const profileParent = process.env.INFLATE_SMOKE_PROFILE_PARENT || os.tmpdir();
  fs.mkdirSync(profileParent, { recursive: true });
  const cleanProfileDir = fs.mkdtempSync(path.join(profileParent, 'inflate-smoke-clean-profile-'));
  log(`Simulated clean-profile globalStorage: ${cleanProfileDir} (${cleanProfileDir.length} characters)`);

  const artifactManager = new ArtifactManager({
    manifest,
    globalStorageDir: cleanProfileDir,
    arch,
    javaBin: jdkResult.javaBin,
    hostJarPath,
  });

  log('Run 1 (clean profile): downloading + verifying + generating engine artifacts (real ~170 MB from Google Maven)...');
  const t0 = Date.now();
  const enginePaths = await artifactManager.ensureInstalled((e) => {
    if (e.totalBytes > 0 && e.bytesDownloaded === e.totalBytes) log(`  done: ${e.artifactKey} (${e.totalBytes} bytes)`);
  });
  log(`Run 1 install complete in ${Date.now() - t0}ms. classpathJars=${enginePaths.classpathJars.length} libraryPackages=${enginePaths.libraryPackages.length}`);
  checkLongestEnginePath(path.join(cleanProfileDir, 'engine'));

  const outputDir = fs.mkdtempSync(path.join(cleanProfileDir, 'renders-'));
  const overlayDir = fs.mkdtempSync(path.join(cleanProfileDir, 'overlay-'));
  const { args } = buildJavaCommand({
    javaBin: jdkResult.javaBin,
    hostJarPath,
    classpathJars: enginePaths.classpathJars,
    layoutlibRuntimeRoot: enginePaths.layoutlibRuntimeRoot,
    layoutlibResourcesRoot: enginePaths.layoutlibResourcesRoot,
  });
  const initParams = {
    layoutlibRuntimeRoot: enginePaths.layoutlibRuntimeRoot,
    layoutlibResourcesRoot: enginePaths.layoutlibResourcesRoot,
    classpathNote: 'assembled-by-launcher',
    libraryResDirs: enginePaths.libraryResDirs,
    libraryPackages: enginePaths.libraryPackages,
    outputDir,
    overlayDir,
    compileSdkVersion: 34,
    logLevel: 'info',
  };
  const renderRequest = {
    id: 1,
    docPath: path.join(REPO_ROOT, 'fixtures/gradle-sample/app/src/main/res/layout/main.xml'),
    docKind: 'layout',
    roots: [path.join(REPO_ROOT, 'fixtures/gradle-sample/app/src/main/res')],
    packageName: 'com.inflate.preview',
    config: {
      themeName: 'Theme.Material3.DayNight',
      isProjectTheme: false,
      night: false,
      device: { id: 'phone', label: 'Phone', widthDp: 411, heightDp: 891, defaultDensity: 'xhdpi', sizeBucket: 'normal' },
      orientation: 'portrait',
      density: 'xhdpi',
      pixelScale: 1,
    },
    timeoutMs: 15000,
  };

  log('Rendering the fixture through the packaged host.jar (args.length=' + args.length + ')...');
  const result1 = await spawnAndRender(jdkResult.javaBin, hostJarPath, args, initParams, renderRequest);
  if (result1.status !== 'ok' || !result1.pngPath || !fs.existsSync(result1.pngPath)) {
    throw new Error(`Run 1 render FAILED: ${JSON.stringify(result1)}`);
  }
  log(`Run 1 render OK through the packaged host.jar: ${result1.pngPath} (${fs.statSync(result1.pngPath).size} bytes)`);

  log('Run 2 ("offline"): re-running ensureInstalled() with a downloader that fails if called...');
  const networkCalls: string[] = [];
  const offlineManager = new ArtifactManager({
    manifest,
    globalStorageDir: cleanProfileDir,
    arch,
    download: async (url) => {
      networkCalls.push(url);
      throw new Error(`network call on a warm cache: ${url}`);
    },
  });
  await offlineManager.ensureInstalled();
  if (networkCalls.length > 0) throw new Error(`Run 2 made ${networkCalls.length} network call(s)`);
  log('Run 2 ensureInstalled made no network call');

  const result2 = await spawnAndRender(jdkResult.javaBin, hostJarPath, args, initParams, { ...renderRequest, id: 2 });
  if (result2.status !== 'ok' || !result2.pngPath) {
    throw new Error(`Run 2 (offline) render FAILED: ${JSON.stringify(result2)}`);
  }
  log(`Run 2 (offline) render OK: ${result2.pngPath}`);

  log('SMOKE TEST PASSED: guided-flow-equivalent setup -> real download+render -> offline re-render, all green.');
}

/** Logs the longest file path under the engine folder and, when `INFLATE_SMOKE_LONGEST_PATH_ABOVE`
 * is set, fails unless it is longer than that many characters (criterion 21: past Windows'
 * 260-character MAX_PATH, so Node's own unzip is exercised on long paths). */
function checkLongestEnginePath(engineDir: string): void {
  let longest = '';
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.length > longest.length) longest = full;
    }
  };
  walk(engineDir);
  const above = Number(process.env.INFLATE_SMOKE_LONGEST_PATH_ABOVE || 0);
  if (above > 0 && longest.length <= above) {
    throw new Error(`longest engine file path is ${longest.length} characters, not above ${above}: ${longest}`);
  }
  log(`longest engine file path: ${longest.length} characters${above > 0 ? ` (above ${above})` : ''}: ${longest}`);
}

main().catch((e) => {
  console.error('[smoke] FAILED:', e);
  process.exitCode = 1;
});
