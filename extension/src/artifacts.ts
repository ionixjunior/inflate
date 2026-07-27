/**
 * ArtifactManager (T16, design component #7, SETUP-02/AD-006/AD-011). Reads the bundled
 * `engine-manifest.json` (T15), downloads whatever isn't cached yet to
 * `globalStorage/engine/<manifestHash>/tmp/` with a streamed SHA-256 check per artifact, unzips
 * runtime/resources/AAR contents into the design's cache layout, and atomically renames each
 * verified artifact into place. A `.complete` marker file is the ONLY thing that makes
 * {@link ArtifactManager.isReady}/`cacheState().ready` true — a half-installed cache (files present
 * but no marker) is never reported ready, so a crash mid-install can't silently look "done".
 *
 * Cache layout (design §Data Models):
 * ```
 * engine/<manifestHash>/
 *   .complete
 *   layoutlib/runtime/            # unzipped runtime jar
 *   layoutlib/resources/          # unzipped resources jar
 *   jars/                         # layoutlib.jar, tools-*.jar, aar classes: <artifact>-classes.jar
 *   aar-res/<artifact>/res/       # per-AAR resources (+ its AndroidManifest.xml, for package name)
 * ```
 *
 * All I/O (network download, unzip) is injectable so tests exercise this against a real local HTTP
 * fixture server with tiny synthetic artifacts — never the real ~170 MB engine download.
 */

import AdmZip from 'adm-zip';
import { execFileSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';

export type ArtifactKind = 'jar' | 'aar' | 'unzip';

/** Matches the layoutlib-runtime classifier values in engine-manifest.json (AD-004: macOS only). */
export type HostArch = 'mac-arm' | 'mac';

export interface ManifestArtifact {
  group: string;
  name: string;
  version: string;
  classifier?: string;
  kind: ArtifactKind;
  url: string;
  sha256: string;
  sizeBytes: number;
}

export interface EngineManifest {
  pinName: string;
  artifacts: ManifestArtifact[];
}

export interface EnginePaths {
  layoutlibRuntimeRoot: string;
  layoutlibResourcesRoot: string;
  classpathJars: string[];
  libraryResDirs: string[];
  libraryPackages: string[];
  manifestHash: string;
}

export interface ArtifactStatus {
  key: string;
  installed: boolean;
  sizeBytes?: number;
}

export interface CacheReport {
  manifestHash: string;
  ready: boolean;
  artifacts: ArtifactStatus[];
}

export interface DownloadProgress {
  artifactKey: string;
  bytesDownloaded: number;
  totalBytes: number;
}

/** Thrown by {@link ArtifactManager.ensureInstalled} when installation cannot proceed because the
 * network is unreachable and no complete cache already exists (P1-H AC1/AC4). */
export class OfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineError';
  }
}

export type DownloadFn = (
  url: string,
  destPath: string,
  onProgress?: (bytesDownloaded: number, totalBytes: number) => void,
) => Promise<void>;
export type UnzipFn = (zipPath: string, destDir: string) => void;

/** Inputs the host-subcommand generation step (framework-delegates.jar + R-classes.jar, T60/AD-014)
 * needs to invoke `MainKt`-adjacent entry points (`engine.FrameworkDelegateGeneratorKt`,
 * `engine.RClassGeneratorKt`) bundled in the shipped host fat-jar. */
export interface GenerateContext {
  javaBin: string;
  hostJarPath: string;
  layoutlibJarPath: string;
  rTxtDir: string;
  workDir: string;
  rClassesJarPath: string;
  rPackagesPath: string;
  frameworkDelegatesJarPath: string;
  /** `RClassGenerator` needs AGP's symbol-table machinery (`com.android.ide.common.symbols.*`),
   * which lives in the downloaded `sdk-common`/`common`/`layoutlib-api` jars (excluded from the fat
   * jar — AD-011, they're Google-Maven artifacts downloaded separately) rather than the host jar
   * itself. Empty for `FrameworkDelegateGenerator`, which only needs the fat jar (ASM) + layoutlib.jar. */
  rClassToolsJars: string[];
}

export type GenerateFn = (ctx: GenerateContext) => void;

/** Real default generator: spawns the bundled host fat-jar's own generator entry points (T38b/T39
 * moved to setup time — the ASM/AGP-symbol machinery is host-side Kotlin; the extension can't run it
 * itself). Synchronous (`execFileSync`) — this runs once, during the one-time engine setup, never on
 * the render hot path. */
export function defaultGenerate(ctx: GenerateContext): void {
  execFileSync(ctx.javaBin, ['-cp', ctx.hostJarPath, 'engine.FrameworkDelegateGeneratorKt', ctx.layoutlibJarPath, ctx.frameworkDelegatesJarPath]);
  fs.mkdirSync(ctx.workDir, { recursive: true });
  const rClassCp = [ctx.hostJarPath, ...ctx.rClassToolsJars].join(path.delimiter);
  execFileSync(ctx.javaBin, ['-cp', rClassCp, 'engine.RClassGeneratorKt', ctx.rTxtDir, ctx.workDir, ctx.rClassesJarPath, ctx.rPackagesPath]);
}

export interface ArtifactManagerOptions {
  manifest: EngineManifest;
  globalStorageDir: string;
  arch: HostArch;
  download?: DownloadFn;
  unzip?: UnzipFn;
  /** JDK binary + bundled host fat-jar path — when BOTH are supplied, `ensureInstalled` also
   * generates `framework-delegates.jar` and `R-classes.jar` at setup time (T60, closes debt #1's
   * "wire framework-delegates.jar generation at engine-setup time" item). Omitted in most unit tests
   * (they don't need real Material/androidx rendering), so generation is entirely skipped then. */
  javaBin?: string;
  hostJarPath?: string;
  generate?: GenerateFn;
}

const MAX_ATTEMPTS = 3;

function artifactKey(a: ManifestArtifact): string {
  return a.classifier ? `${a.group}:${a.name}:${a.version}:${a.classifier}` : `${a.group}:${a.name}:${a.version}`;
}

function jarFileName(a: ManifestArtifact): string {
  const base = `${a.name}-${a.version}`;
  return a.classifier ? `${base}-${a.classifier}.jar` : `${base}.jar`;
}

/** Only one `layoutlib-runtime` classifier (the host's own arch) is ever needed at runtime — the
 * manifest carries both so a single bundled manifest works on either Mac architecture (AD-004). */
export function selectRelevantArtifacts(manifest: EngineManifest, arch: HostArch): ManifestArtifact[] {
  return manifest.artifacts.filter((a) => a.name !== 'layoutlib-runtime' || a.classifier === arch);
}

/** Cache-directory key (design: "cache dir keyed by manifest hash"). */
export function computeManifestHash(manifest: EngineManifest): string {
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function isNetworkError(e: unknown): boolean {
  const code = (e as { code?: string } | undefined)?.code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    code === 'EPIPE'
  );
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/** Real default downloader: streams the HTTP(S) response to [destPath], reporting progress and
 * following at most 5 redirects (Google Maven / a local fixture server both stay well under that). */
export function defaultDownload(
  targetUrl: string,
  destPath: string,
  onProgress?: (bytesDownloaded: number, totalBytes: number) => void,
  redirectsLeft = 5,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith('https:') ? https : http;
    const req = client.get(targetUrl, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error(`too many redirects fetching ${targetUrl}`));
          return;
        }
        defaultDownload(res.headers.location, destPath, onProgress, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`HTTP ${status} fetching ${targetUrl}`));
        return;
      }
      const total = Number(res.headers['content-length'] ?? 0);
      let downloaded = 0;
      const out = fs.createWriteStream(destPath);
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        onProgress?.(downloaded, total);
      });
      res.on('error', (e) => {
        out.destroy();
        reject(e);
      });
      out.on('error', reject);
      out.on('finish', () => resolve());
      res.pipe(out);
    });
    req.on('error', reject);
  });
}

/** Real default unzip: extracts the whole archive into [destDir]. */
export function defaultUnzip(zipPath: string, destDir: string): void {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

export class ArtifactManager {
  readonly manifestHash: string;
  private readonly relevant: ManifestArtifact[];
  private readonly download: DownloadFn;
  private readonly unzip: UnzipFn;
  private readonly generate: GenerateFn;

  constructor(private readonly opts: ArtifactManagerOptions) {
    this.relevant = selectRelevantArtifacts(opts.manifest, opts.arch);
    this.manifestHash = computeManifestHash(opts.manifest);
    this.download = opts.download ?? defaultDownload;
    this.unzip = opts.unzip ?? defaultUnzip;
    this.generate = opts.generate ?? defaultGenerate;
  }

  private engineDir(): string {
    return path.join(this.opts.globalStorageDir, 'engine', this.manifestHash);
  }
  private tmpDir(): string {
    return path.join(this.engineDir(), 'tmp');
  }
  private completeMarker(): string {
    return path.join(this.engineDir(), '.complete');
  }
  private jarsDir(): string {
    return path.join(this.engineDir(), 'jars');
  }
  private runtimeDir(): string {
    return path.join(this.engineDir(), 'layoutlib', 'runtime');
  }
  private resourcesDir(): string {
    return path.join(this.engineDir(), 'layoutlib', 'resources');
  }
  private aarResDir(artifactName: string): string {
    return path.join(this.engineDir(), 'aar-res', artifactName);
  }
  private rTxtDir(): string {
    return path.join(this.engineDir(), 'generated', 'rtxt');
  }
  private generatedDir(): string {
    return path.join(this.engineDir(), 'generated');
  }
  private frameworkDelegatesJarPath(): string {
    return path.join(this.generatedDir(), 'framework-delegates.jar');
  }
  private rClassesJarPath(): string {
    return path.join(this.generatedDir(), 'R-classes.jar');
  }
  private rPackagesPath(): string {
    return path.join(this.generatedDir(), 'r-packages.txt');
  }
  private layoutlibJarPath(): string {
    const artifact = this.relevant.find((a) => a.kind === 'jar' && a.name === 'layoutlib');
    return artifact ? path.join(this.jarsDir(), jarFileName(artifact)) : '';
  }
  /** The downloaded `sdk-common`/`common`/`layoutlib-api` jars `RClassGenerator` needs on its
   * classpath (AGP's symbol-table machinery) — see {@link GenerateContext.rClassToolsJars}. */
  private rClassToolsJarPaths(): string[] {
    return this.relevant
      .filter((a) => a.kind === 'jar' && ['sdk-common', 'common', 'layoutlib-api'].includes(a.name))
      .map((a) => path.join(this.jarsDir(), jarFileName(a)));
  }

  /** `.complete` marker presence — the only signal that gates readiness (never a partial cache). */
  isReady(): boolean {
    return fs.existsSync(this.completeMarker());
  }

  async ensureInstalled(onProgress?: (event: DownloadProgress) => void): Promise<EnginePaths> {
    if (this.isReady()) {
      return this.resolvePaths();
    }

    fs.mkdirSync(this.tmpDir(), { recursive: true });
    try {
      for (const artifact of this.relevant) {
        try {
          await this.installOne(artifact, onProgress);
        } catch (e) {
          if (isNetworkError(e)) {
            throw new OfflineError(
              `Inflate needs a one-time network connection to download the render engine (~170 MB) ` +
                `from Google Maven. Failed on ${artifact.name}: ${(e as Error).message}`,
            );
          }
          throw e;
        }
      }
      this.runGeneration();
      fs.writeFileSync(this.completeMarker(), new Date().toISOString());
    } finally {
      fs.rmSync(this.tmpDir(), { recursive: true, force: true });
    }

    return this.resolvePaths();
  }

  cacheState(): CacheReport {
    const artifacts: ArtifactStatus[] = this.relevant.map((a) => {
      const installed = this.isArtifactInstalled(a);
      let sizeBytes: number | undefined;
      if (installed && a.kind === 'jar') {
        sizeBytes = fs.statSync(path.join(this.jarsDir(), jarFileName(a))).size;
      }
      return { key: artifactKey(a), installed, sizeBytes };
    });
    return { manifestHash: this.manifestHash, ready: this.isReady(), artifacts };
  }

  /** Deletes the whole `engine/<manifestHash>/` directory (design: "host stopped first" is the
   * caller's responsibility — HostManager/T17 — this method only handles the filesystem side). */
  clear(): void {
    fs.rmSync(this.engineDir(), { recursive: true, force: true });
  }

  private isArtifactInstalled(artifact: ManifestArtifact): boolean {
    switch (artifact.kind) {
      case 'jar':
        return fs.existsSync(path.join(this.jarsDir(), jarFileName(artifact)));
      case 'unzip': {
        const destDir = artifact.name === 'layoutlib-runtime' ? this.runtimeDir() : this.resourcesDir();
        return fs.existsSync(destDir) && fs.readdirSync(destDir).length > 0;
      }
      case 'aar':
        // Keyed on the AAR's own AndroidManifest.xml (every AAR ships one — finalize() unzips it,
        // readPackageName() already relies on it), not on `res/` — ~15 of the pinned androidx AARs
        // ship no resources at all (code-only), and checking `res/` reported those as permanently
        // "missing" even once fully extracted (T80, HOST-04 AC5).
        return fs.existsSync(path.join(this.aarResDir(artifact.name), 'AndroidManifest.xml'));
    }
  }

  private async installOne(artifact: ManifestArtifact, onProgress?: (event: DownloadProgress) => void): Promise<void> {
    if (this.isArtifactInstalled(artifact)) return;

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const tmpFile = path.join(this.tmpDir(), `${artifactKey(artifact).replace(/[:@]/g, '_')}.part`);
      try {
        if (fs.existsSync(tmpFile)) fs.rmSync(tmpFile, { force: true });
        await this.download(artifact.url, tmpFile, (b, t) =>
          onProgress?.({ artifactKey: artifactKey(artifact), bytesDownloaded: b, totalBytes: t }),
        );
        const actualSha = await sha256File(tmpFile);
        if (actualSha !== artifact.sha256) {
          fs.rmSync(tmpFile, { force: true });
          lastError = new Error(
            `checksum mismatch for ${artifact.name}: expected ${artifact.sha256}, got ${actualSha}`,
          );
          continue;
        }
        this.finalize(artifact, tmpFile);
        if (fs.existsSync(tmpFile)) fs.rmSync(tmpFile, { force: true });
        return;
      } catch (e) {
        if (fs.existsSync(tmpFile)) fs.rmSync(tmpFile, { force: true });
        if (isNetworkError(e)) throw e; // propagate immediately — retrying an unreachable host wastes time
        lastError = e;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** Moves a verified tmp file into its final, atomic location per [ArtifactKind]. */
  private finalize(artifact: ManifestArtifact, tmpFile: string): void {
    switch (artifact.kind) {
      case 'jar': {
        fs.mkdirSync(this.jarsDir(), { recursive: true });
        fs.renameSync(tmpFile, path.join(this.jarsDir(), jarFileName(artifact)));
        break;
      }
      case 'unzip': {
        const destDir = artifact.name === 'layoutlib-runtime' ? this.runtimeDir() : this.resourcesDir();
        fs.mkdirSync(destDir, { recursive: true });
        this.unzip(tmpFile, destDir);
        break;
      }
      case 'aar': {
        const destDir = this.aarResDir(artifact.name);
        fs.mkdirSync(destDir, { recursive: true });
        this.unzip(tmpFile, destDir);
        fs.mkdirSync(this.jarsDir(), { recursive: true });
        const classesJar = path.join(destDir, 'classes.jar');
        if (fs.existsSync(classesJar)) {
          fs.renameSync(classesJar, path.join(this.jarsDir(), `${artifact.name}-classes.jar`));
        }
        break;
      }
    }
  }

  private readPackageName(artifactName: string): string | undefined {
    const manifestPath = path.join(this.aarResDir(artifactName), 'AndroidManifest.xml');
    if (!fs.existsSync(manifestPath)) return undefined;
    const xml = fs.readFileSync(manifestPath, 'utf8');
    const match = xml.match(/package\s*=\s*"([^"]+)"/);
    return match?.[1];
  }

  /**
   * Generates `framework-delegates.jar` (AD-014) and `R-classes.jar` (LAY-05) at engine-SETUP time
   * by invoking the bundled host fat-jar's own generator entry points as subprocesses — the ASM class
   * rename and the AGP symbol-table machinery are host-side Kotlin/JVM code the TS extension cannot
   * run itself (T60, closes debt #1's remaining generation-wiring item). Skipped entirely when
   * `javaBin`/`hostJarPath` aren't supplied (most unit tests, which don't need real Material/androidx
   * rendering). Each bundled AAR's `R.txt` (already unzipped into `aar-res/<name>/R.txt` by
   * [finalize]) is copied into a package-named rTxtDir first, matching what `RClassGenerator` expects.
   */
  private runGeneration(): void {
    const { javaBin, hostJarPath } = this.opts;
    if (!javaBin || !hostJarPath) return;

    const rTxtDir = this.rTxtDir();
    fs.mkdirSync(rTxtDir, { recursive: true });
    for (const artifact of this.relevant.filter((a) => a.kind === 'aar')) {
      const pkg = this.readPackageName(artifact.name);
      const rTxt = path.join(this.aarResDir(artifact.name), 'R.txt');
      if (pkg && fs.existsSync(rTxt)) {
        fs.copyFileSync(rTxt, path.join(rTxtDir, `${pkg}.txt`));
      }
    }
    if (fs.readdirSync(rTxtDir).length === 0) return; // no AARs shipped an R.txt — nothing to generate

    this.generate({
      javaBin,
      hostJarPath,
      layoutlibJarPath: this.layoutlibJarPath(),
      rTxtDir,
      workDir: path.join(this.generatedDir(), 'work'),
      rClassesJarPath: this.rClassesJarPath(),
      rPackagesPath: this.rPackagesPath(),
      rClassToolsJars: this.rClassToolsJarPaths(),
      frameworkDelegatesJarPath: this.frameworkDelegatesJarPath(),
    });
  }

  private resolvePaths(): EnginePaths {
    const aarArtifacts = this.relevant.filter((a) => a.kind === 'aar');
    // Plain jars (layoutlib, tools) plus each AAR's extracted `<name>-classes.jar` (see finalize):
    // the library view classes (MaterialButton, ConstraintLayout, …) MUST be on the host classpath or
    // they inflate as MockView placeholders (LAY-05). Resource-only AARs have no classes.jar — skip.
    const jarJars = this.relevant
      .filter((a) => a.kind === 'jar')
      .map((a) => path.join(this.jarsDir(), jarFileName(a)));
    const aarClassesJars = aarArtifacts
      .map((a) => path.join(this.jarsDir(), `${a.name}-classes.jar`))
      .filter((p) => fs.existsSync(p));
    // T60: R classes + framework delegates, generated once at setup time (see runGeneration) — join
    // the classpath only when actually present (skipped when no javaBin/hostJarPath was supplied).
    const generatedJars = [this.rClassesJarPath(), this.frameworkDelegatesJarPath()].filter((p) => fs.existsSync(p));
    const classpathJars = [...jarJars, ...aarClassesJars, ...generatedJars];
    const libraryResDirs = aarArtifacts.map((a) => path.join(this.aarResDir(a.name), 'res'));
    const generatedPackages = fs.existsSync(this.rPackagesPath())
      ? fs.readFileSync(this.rPackagesPath(), 'utf8').split('\n').filter((l) => l.trim().length > 0)
      : [];
    const libraryPackages = Array.from(
      new Set([
        ...aarArtifacts.map((a) => this.readPackageName(a.name)).filter((p): p is string => Boolean(p)),
        ...generatedPackages,
      ]),
    );

    return {
      layoutlibRuntimeRoot: this.runtimeDir(),
      layoutlibResourcesRoot: this.resourcesDir(),
      classpathJars,
      libraryResDirs,
      libraryPackages,
      manifestHash: this.manifestHash,
    };
  }
}
