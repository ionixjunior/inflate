import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import {
  ArtifactManager,
  EngineManifest,
  GenerateContext,
  ManifestArtifact,
  OfflineError,
  computeManifestHash,
  selectRelevantArtifacts,
} from './artifacts';

// ---- tiny local HTTP fixture server (real networking, real tiny artifacts — never the real ~170 MB engine) ----

type RouteHandler = Buffer | ((req: http.IncomingMessage, res: http.ServerResponse) => void);

function startFixtureServer(routes: Record<string, RouteHandler>): Promise<{
  baseUrl: string;
  server: http.Server;
  requestCounts: Record<string, number>;
}> {
  const requestCounts: Record<string, number> = {};
  const server = http.createServer((req, res) => {
    const p = req.url ?? '';
    requestCounts[p] = (requestCounts[p] ?? 0) + 1;
    const handler = routes[p];
    if (!handler) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    if (Buffer.isBuffer(handler)) {
      res.writeHead(200, { 'Content-Length': String(handler.length) });
      res.end(handler);
    } else {
      handler(req, res);
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, server, requestCounts });
    });
  });
}

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Builds a tiny valid zip in memory (used for both 'unzip'-kind and 'aar'-kind fixture artifacts). */
function buildZip(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [entryName, content] of Object.entries(entries)) {
    zip.addFile(entryName, Buffer.from(content));
  }
  return zip.toBuffer();
}

describe('ArtifactManager (T16) — verified installs against a local HTTP fixture server', () => {
  let tempRoot: string;
  let server: http.Server | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-artifacts-'));
  });

  afterEach(async () => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
  });

  const jarBytes = Buffer.from('tiny-fake-layoutlib-jar-bytes');
  const runtimeZip = buildZip({ 'build.prop': 'ro.build.version=14\n' });
  const aarZip = buildZip({
    'classes.jar': 'tiny-fake-classes-jar-bytes',
    'AndroidManifest.xml': '<manifest package="com.example.material"></manifest>',
    'res/values/dummy.xml': '<resources/>',
  });

  /** Starts a fixture server serving the three fixed-shape artifacts above at fixed paths, then
   * builds a manifest whose URLs point at that server (no throwaway server needed). */
  async function startFullFixture(): Promise<{
    manifest: EngineManifest;
    server: http.Server;
    requestCounts: Record<string, number>;
    baseUrl: string;
  }> {
    const fixture = await startFixtureServer({
      '/layoutlib.jar': jarBytes,
      '/runtime-mac-arm.jar': runtimeZip,
      '/material.aar': aarZip,
    });
    return { manifest: buildManifest(fixture.baseUrl), server: fixture.server, requestCounts: fixture.requestCounts, baseUrl: fixture.baseUrl };
  }

  function buildManifest(baseUrl: string): EngineManifest {
    const artifacts: ManifestArtifact[] = [
      {
        group: 'com.android.tools.layoutlib',
        name: 'layoutlib',
        version: '14.0.11',
        kind: 'jar',
        url: `${baseUrl}/layoutlib.jar`,
        sha256: sha256(jarBytes),
        sizeBytes: jarBytes.length,
      },
      {
        group: 'com.android.tools.layoutlib',
        name: 'layoutlib-runtime',
        version: '14.0.11',
        classifier: 'mac-arm',
        kind: 'unzip',
        url: `${baseUrl}/runtime-mac-arm.jar`,
        sha256: sha256(runtimeZip),
        sizeBytes: runtimeZip.length,
      },
      {
        group: 'com.android.tools.layoutlib',
        name: 'layoutlib-runtime',
        version: '14.0.11',
        classifier: 'mac',
        kind: 'unzip',
        // Not served (only mac-arm is "relevant" on our test arch) — a broken URL proves it's skipped.
        url: `${baseUrl}/runtime-mac-x64-should-never-be-fetched.jar`,
        sha256: 'deadbeef',
        sizeBytes: 1,
      },
      {
        group: 'com.google.android.material',
        name: 'material',
        version: '1.12.0',
        kind: 'aar',
        url: `${baseUrl}/material.aar`,
        sha256: sha256(aarZip),
        sizeBytes: aarZip.length,
      },
    ];
    return { pinName: 'test-pin', artifacts };
  }

  it('performs a fresh install: downloads, verifies, unzips/extracts, and marks .complete', async () => {
    const fresh = await startFullFixture();
    server = fresh.server;
    const manifest = fresh.manifest;

    const manager = new ArtifactManager({ manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });
    expect(manager.isReady()).toBe(false);

    const paths = await manager.ensureInstalled();

    expect(manager.isReady()).toBe(true);
    expect(paths.manifestHash).toBe(computeManifestHash(manifest));
    expect(paths.classpathJars.some((p) => p.endsWith('layoutlib-14.0.11.jar'))).toBe(true);
    // T39/debt#1: each AAR's extracted classes.jar joins the host classpath, else Material/androidx
    // view classes inflate as MockView placeholders (LAY-05).
    expect(paths.classpathJars.some((p) => p.endsWith('material-classes.jar'))).toBe(true);
    expect(fs.existsSync(path.join(paths.layoutlibRuntimeRoot, 'build.prop'))).toBe(true);
    expect(paths.libraryResDirs.some((p) => p.endsWith(path.join('material', 'res')))).toBe(true);
    expect(fs.existsSync(path.join(paths.libraryResDirs[0], 'values', 'dummy.xml'))).toBe(true);
    expect(paths.libraryPackages).toContain('com.example.material');
    // the mac (x64) runtime classifier was never fetched — only the host's own arch (mac-arm)
    expect(fresh.requestCounts['/runtime-mac-x64-should-never-be-fetched.jar']).toBeUndefined();
  });

  it('is a no-op on the second call: no re-download once .complete exists', async () => {
    const fixture = await startFullFixture();
    server = fixture.server;

    const manager = new ArtifactManager({ manifest: fixture.manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });
    await manager.ensureInstalled();
    const countsAfterFirst = { ...fixture.requestCounts };

    await manager.ensureInstalled();

    expect(fixture.requestCounts).toEqual(countsAfterFirst); // no new HTTP requests on the re-run
  });

  it('discards and retries on checksum mismatch, then fails without installing a corrupt artifact', async () => {
    const jarBytes = Buffer.from('actual-bytes-served-by-the-fixture-server');
    const fixture = await startFixtureServer({ '/bad.jar': jarBytes });
    server = fixture.server;
    const manifest: EngineManifest = {
      pinName: 'test-pin',
      artifacts: [
        {
          group: 'g',
          name: 'bad-artifact',
          version: '1.0',
          kind: 'jar',
          url: `${fixture.baseUrl}/bad.jar`,
          sha256: '0'.repeat(64), // deliberately wrong — never matches the real content
          sizeBytes: jarBytes.length,
        },
      ],
    };

    const manager = new ArtifactManager({ manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });

    await expect(manager.ensureInstalled()).rejects.toThrow(/checksum mismatch/);
    expect(fixture.requestCounts['/bad.jar']).toBe(3); // discarded + retried up to the retry cap
    expect(fs.existsSync(path.join(tempRoot, 'engine', computeManifestHash(manifest), 'jars', 'bad-artifact-1.0.jar'))).toBe(
      false,
    );
  });

  it('leaves no partial install when the download is interrupted mid-stream', async () => {
    const fullBytes = Buffer.from('x'.repeat(5000));
    const fixture = await startFixtureServer({
      '/interrupted.jar': (_req, res) => {
        res.writeHead(200, { 'Content-Length': String(fullBytes.length) });
        res.write(fullBytes.subarray(0, 100));
        res.destroy(); // simulate a dropped connection partway through
      },
    });
    server = fixture.server;
    const manifest: EngineManifest = {
      pinName: 'test-pin',
      artifacts: [
        {
          group: 'g',
          name: 'interrupted',
          version: '1.0',
          kind: 'jar',
          url: `${fixture.baseUrl}/interrupted.jar`,
          sha256: sha256(fullBytes),
          sizeBytes: fullBytes.length,
        },
      ],
    };
    const manager = new ArtifactManager({ manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });

    await expect(manager.ensureInstalled()).rejects.toThrow();

    const finalPath = path.join(tempRoot, 'engine', computeManifestHash(manifest), 'jars', 'interrupted-1.0.jar');
    expect(fs.existsSync(finalPath)).toBe(false);
    expect(manager.isReady()).toBe(false);
  });

  it('rejects with OfflineError when the network is unreachable and there is no cache yet', async () => {
    // Nothing is listening on this port — a real connection-refused, not a mock.
    const manifest: EngineManifest = {
      pinName: 'test-pin',
      artifacts: [
        {
          group: 'g',
          name: 'unreachable',
          version: '1.0',
          kind: 'jar',
          url: 'http://127.0.0.1:1/never-listening.jar',
          sha256: 'a'.repeat(64),
          sizeBytes: 1,
        },
      ],
    };
    const manager = new ArtifactManager({ manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });

    await expect(manager.ensureInstalled()).rejects.toBeInstanceOf(OfflineError);
  });

  it('succeeds offline when the cache is already complete (no network call at all)', async () => {
    const manifest: EngineManifest = {
      pinName: 'test-pin',
      artifacts: [
        {
          group: 'g',
          name: 'already-installed',
          version: '1.0',
          kind: 'jar',
          url: 'http://127.0.0.1:1/never-listening.jar',
          sha256: 'a'.repeat(64),
          sizeBytes: 1,
        },
      ],
    };
    const manager = new ArtifactManager({ manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });
    const engineDir = path.join(tempRoot, 'engine', computeManifestHash(manifest));
    fs.mkdirSync(path.join(engineDir, 'jars'), { recursive: true });
    fs.writeFileSync(path.join(engineDir, 'jars', 'already-installed-1.0.jar'), 'x');
    fs.writeFileSync(path.join(engineDir, '.complete'), 'done');

    const paths = await manager.ensureInstalled();

    expect(paths.classpathJars).toEqual([path.join(engineDir, 'jars', 'already-installed-1.0.jar')]);
  });

  it('clear() removes the whole engine cache directory', async () => {
    const fixture = await startFullFixture();
    server = fixture.server;
    const manager = new ArtifactManager({ manifest: fixture.manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });
    await manager.ensureInstalled();
    const engineDir = path.join(tempRoot, 'engine', computeManifestHash(fixture.manifest));
    expect(fs.existsSync(engineDir)).toBe(true);

    manager.clear();

    expect(fs.existsSync(engineDir)).toBe(false);
  });

  it('reports a code-only AAR (no res/) as installed once extracted (HOST-04 AC5)', async () => {
    // Mirrors the ~15 pinned androidx AARs that ship no resources at all — code-only, like
    // androidx.annotation:annotation.
    const codeOnlyAarZip = buildZip({
      'classes.jar': 'tiny-fake-code-only-classes-jar-bytes',
      'AndroidManifest.xml': '<manifest package="com.example.codeonly"></manifest>',
    });
    const fixture = await startFixtureServer({ '/code-only.aar': codeOnlyAarZip });
    server = fixture.server;
    const manifest: EngineManifest = {
      pinName: 'test-pin',
      artifacts: [
        {
          group: 'androidx.example',
          name: 'code-only',
          version: '1.0',
          kind: 'aar',
          url: `${fixture.baseUrl}/code-only.aar`,
          sha256: sha256(codeOnlyAarZip),
          sizeBytes: codeOnlyAarZip.length,
        },
      ],
    };
    const manager = new ArtifactManager({ manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });

    await manager.ensureInstalled();

    const status = manager.cacheState().artifacts.find((a) => a.key.includes('code-only'));
    expect(status?.installed).toBe(true);
  });

  it('reports a res-bearing AAR as installed after extraction, unchanged (regression, HOST-04 AC5)', async () => {
    const fixture = await startFullFixture();
    server = fixture.server;
    const manager = new ArtifactManager({ manifest: fixture.manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });

    await manager.ensureInstalled();

    const status = manager.cacheState().artifacts.find((a) => a.key.includes('material'));
    expect(status?.installed).toBe(true);
  });

  it('reports an AAR as not installed before it is ever extracted (HOST-04 AC5)', async () => {
    const fixture = await startFullFixture();
    server = fixture.server;
    const manager = new ArtifactManager({ manifest: fixture.manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });

    const status = manager.cacheState().artifacts.find((a) => a.key.includes('material'));
    expect(status?.installed).toBe(false);
  });

  it('never reports ready from a half-installed cache (no .complete marker)', () => {
    const manifest: EngineManifest = {
      pinName: 'test-pin',
      artifacts: [
        {
          group: 'g',
          name: 'half',
          version: '1.0',
          kind: 'jar',
          url: 'http://127.0.0.1:1/x.jar',
          sha256: 'a'.repeat(64),
          sizeBytes: 1,
        },
      ],
    };
    const manager = new ArtifactManager({ manifest, globalStorageDir: tempRoot, arch: 'mac-arm' });
    const engineDir = path.join(tempRoot, 'engine', computeManifestHash(manifest));
    fs.mkdirSync(path.join(engineDir, 'jars'), { recursive: true });
    fs.writeFileSync(path.join(engineDir, 'jars', 'half-1.0.jar'), 'x'); // artifact file present...

    expect(manager.isReady()).toBe(false); // ...but no .complete marker, so never "ready"
    const report = manager.cacheState();
    expect(report.ready).toBe(false);
  });
});

describe('ArtifactManager — generated-artifact wiring (T60, closes debt #1 generation step)', () => {
  let tempRoot: string;
  let server: http.Server | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-artifacts-gen-'));
  });

  afterEach(async () => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
  });

  const jarBytes = Buffer.from('tiny-fake-layoutlib-jar-bytes');
  const aarWithRTxt = buildZip({
    'classes.jar': 'tiny-fake-classes-jar-bytes',
    'AndroidManifest.xml': '<manifest package="com.example.withrtxt"></manifest>',
    'res/values/dummy.xml': '<resources/>',
    'R.txt': 'int attr colorPrimary 0x0\n',
  });

  const sdkCommonBytes = Buffer.from('tiny-fake-sdk-common-jar-bytes');

  async function startFixtureAndManifest(): Promise<{ manifest: EngineManifest; server: http.Server }> {
    const fixture = await startFixtureServer({
      '/layoutlib.jar': jarBytes,
      '/material.aar': aarWithRTxt,
      '/sdk-common.jar': sdkCommonBytes,
    });
    const manifest: EngineManifest = {
      pinName: 'test-pin',
      artifacts: [
        {
          group: 'com.android.tools.layoutlib',
          name: 'layoutlib',
          version: '14.0.11',
          kind: 'jar',
          url: `${fixture.baseUrl}/layoutlib.jar`,
          sha256: sha256(jarBytes),
          sizeBytes: jarBytes.length,
        },
        {
          group: 'com.google.android.material',
          name: 'material',
          version: '1.12.0',
          kind: 'aar',
          url: `${fixture.baseUrl}/material.aar`,
          sha256: sha256(aarWithRTxt),
          sizeBytes: aarWithRTxt.length,
        },
        // RClassGenerator needs AGP's symbol-table machinery (com.android.ide.common.symbols.*),
        // which lives here — NOT in the host fat-jar (excluded, AD-011) — regression coverage for
        // the real gap the T60 clean-profile smoke test caught (NoClassDefFoundError: SymbolIo).
        {
          group: 'com.android.tools',
          name: 'sdk-common',
          version: '31.4.2',
          kind: 'jar',
          url: `${fixture.baseUrl}/sdk-common.jar`,
          sha256: sha256(sdkCommonBytes),
          sizeBytes: sdkCommonBytes.length,
        },
      ],
    };
    return { manifest, server: fixture.server };
  }

  it('invokes generate() with a package-named R.txt copy when javaBin + hostJarPath are supplied', async () => {
    const fixture = await startFixtureAndManifest();
    server = fixture.server;
    const calls: GenerateContext[] = [];
    const manager = new ArtifactManager({
      manifest: fixture.manifest,
      globalStorageDir: tempRoot,
      arch: 'mac-arm',
      javaBin: '/fake/bin/java',
      hostJarPath: '/fake/host.jar',
      generate: (ctx) => calls.push(ctx),
    });

    await manager.ensureInstalled();

    expect(calls).toHaveLength(1);
    expect(calls[0].javaBin).toBe('/fake/bin/java');
    expect(calls[0].hostJarPath).toBe('/fake/host.jar');
    expect(calls[0].layoutlibJarPath.endsWith('layoutlib-14.0.11.jar')).toBe(true);
    expect(calls[0].rClassToolsJars.some((p) => p.endsWith('sdk-common-31.4.2.jar'))).toBe(true);
    const copiedRTxt = path.join(calls[0].rTxtDir, 'com.example.withrtxt.txt');
    expect(fs.existsSync(copiedRTxt)).toBe(true);
    expect(fs.readFileSync(copiedRTxt, 'utf8')).toBe('int attr colorPrimary 0x0\n');
  });

  it('never invokes generate() when javaBin/hostJarPath are not supplied (most unit tests)', async () => {
    const fixture = await startFixtureAndManifest();
    server = fixture.server;
    const calls: GenerateContext[] = [];
    const manager = new ArtifactManager({
      manifest: fixture.manifest,
      globalStorageDir: tempRoot,
      arch: 'mac-arm',
      generate: (ctx) => calls.push(ctx),
    });

    await manager.ensureInstalled();

    expect(calls).toHaveLength(0);
  });

  it('resolvePaths includes the generated jars and merges r-packages.txt once generate() produces them', async () => {
    const fixture = await startFixtureAndManifest();
    server = fixture.server;
    const manager = new ArtifactManager({
      manifest: fixture.manifest,
      globalStorageDir: tempRoot,
      arch: 'mac-arm',
      javaBin: '/fake/bin/java',
      hostJarPath: '/fake/host.jar',
      generate: (ctx) => {
        fs.mkdirSync(path.dirname(ctx.rClassesJarPath), { recursive: true });
        fs.writeFileSync(ctx.rClassesJarPath, 'fake-r-classes-jar');
        fs.writeFileSync(ctx.frameworkDelegatesJarPath, 'fake-framework-delegates-jar');
        fs.writeFileSync(ctx.rPackagesPath, 'com.example.withrtxt\n');
      },
    });

    const paths = await manager.ensureInstalled();

    expect(paths.classpathJars.some((p) => p.endsWith('R-classes.jar'))).toBe(true);
    expect(paths.classpathJars.some((p) => p.endsWith('framework-delegates.jar'))).toBe(true);
    expect(paths.libraryPackages).toContain('com.example.withrtxt');
  });
});

describe('selectRelevantArtifacts', () => {
  it('keeps only the layoutlib-runtime entry matching the host arch, plus all other kinds', () => {
    const manifest: EngineManifest = {
      pinName: 'p',
      artifacts: [
        { group: 'g', name: 'layoutlib', version: '1', kind: 'jar', url: 'u', sha256: 's', sizeBytes: 1 },
        {
          group: 'g',
          name: 'layoutlib-runtime',
          version: '1',
          classifier: 'mac-arm',
          kind: 'unzip',
          url: 'u',
          sha256: 's',
          sizeBytes: 1,
        },
        {
          group: 'g',
          name: 'layoutlib-runtime',
          version: '1',
          classifier: 'mac',
          kind: 'unzip',
          url: 'u',
          sha256: 's',
          sizeBytes: 1,
        },
      ],
    };
    const relevant = selectRelevantArtifacts(manifest, 'mac-arm');
    expect(relevant).toHaveLength(2);
    expect(relevant.find((a) => a.name === 'layoutlib-runtime')?.classifier).toBe('mac-arm');
  });
});
