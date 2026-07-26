# Release checklist (T60)

## Build the VSIX

```sh
npm run package   # repo root: builds the host fat-jar, copies it to extension/host.jar,
                   # builds the extension, and runs `vsce package --no-dependencies`
```

This produces `extension/inflate-<version>.vsix`. `--no-dependencies` is required: esbuild already
bundles every runtime dependency (`adm-zip`, `vscode-jsonrpc`) into `dist/extension.js`, so vsce must
not try to separately include `node_modules` (it's fully excluded via `.vscodeignore`).

### What's inside the VSIX (measured, this build)

| Item | Size | Source |
| ---- | ---- | ------ |
| `host.jar` (fat-jar) | ~39 MB | `host/build.gradle.kts`'s `shadowJar` task |
| `engine-manifest.json` | ~22 KB | `host`'s `generateEngineManifest` task (committed, regenerated on pin bumps) |
| `dist/extension.js` + `dist/webview.js` | ~320 KB | esbuild production bundle |
| `media/icon.png` | <1 KB | placeholder — see note below |
| **Total VSIX** | **~35 MB** | well under the 50 MB gate |

**AD-011 size note (SPEC_DEVIATION):** the fat-jar's own estimate was ~25-40 MB; the actual measured
size (~39 MB) sits at the top of that range. `minimize()` (Shadow's dead-code stripper) was tried to
shrink it further but broke the real engine twice when smoke-tested (stripped `kotlin-reflect`, then
`gnu.trove.THashMap` — both needed via reflection/ServiceLoader paths minimize's static analysis
can't see). Rather than ship an unverified minimized jar, only specific, well-understood exclusions
are applied (the Google-Maven artifacts downloaded separately per-user, Android Studio's analytics
protobuf schema, and Windows-only JNA bindings — irrelevant on the macOS-only v1, AD-004). See the
comment above `tasks.shadowJar` in `host/build.gradle.kts` for the full reasoning.

**Icon note:** `extension/media/icon.png` is a simple placeholder generated for this batch (a
rounded-square glyph), not a commissioned design asset. Replace it with real brand artwork before
publishing to the Marketplace for real.

**Publisher note:** `package.json`'s `repository`/`bugs` URLs point at the real repository
(`github.com/ionixjunior/inflate`); `publisher: "inflate"` is still a placeholder pending the real
Marketplace publisher account — update it at the same time as the icon.

## Gate before every release

```sh
cd extension && npm run build && npm test && npm run test:integration
cd ../host && ./gradlew build test engineTest
npm run corpus              # repo root
npm run package              # repo root — produces the VSIX
```

All must be green. `npm run corpus` and `npm run package` both exercise the REAL render host (real
JVM spawn), not a scripted fake — see `corpus/src/hostClient.ts`'s doc for why `packageName` must
always be `com.inflate.preview` (protocol.ts's `ENGINE_PACKAGE_NAME`) regardless of the previewed
project's real package.

## Clean-profile smoke test (P1-H Independent Test)

**What it proves:** "install VSIX -> open fixture layout -> guided flow completes -> render appears;
then disable network -> renders still work" — end to end, against the REAL packaged `host.jar`, a
REAL JDK, and a REAL one-time download from Google Maven (no fakes).

**How it was run for this release** (a literal fresh macOS user account wasn't available in this
environment, so this is the closest faithful equivalent — see `extension/src/test/smoke.ts` for the
full script):

1. `npm run package` at the repo root (builds `host.jar`, packages the VSIX).
2. `cd extension && npx tsc -p tsconfig.test.json` (compiles `src/test/smoke.ts`).
3. `node out/test/smoke.js` — this:
   - detects a real JDK (`JdkLocator`, no `inflate.javaHome` override) — found the Microsoft OpenJDK
     17 install via `JAVA_HOME`;
   - builds a REAL `ArtifactManager` against the bundled `engine-manifest.json`, a **brand-new temp
     directory as `globalStorageDir`** (no pre-existing cache — the clean-profile condition), and the
     REAL packaged `host.jar`;
   - runs `ensureInstalled()` for real: downloads all ~63 pinned artifacts (~170 MB) from
     `dl.google.com`, verifies each SHA-256, generates `framework-delegates.jar` (25 classes) and
     `R-classes.jar` (42 packages) by invoking the packaged `host.jar`'s own generator entry points —
     **completed in ~25-28 seconds**;
   - spawns the REAL host (`java -cp host.jar:<downloaded jars> MainKt`), sends `initialize`/
     `warmup`/`render` for `fixtures/gradle-sample/.../main.xml`, and gets back a real PNG —
     **pixel-identical (0% diff) to the golden corpus's `gradle-main__default.png`**;
   - re-runs `ensureInstalled()` a second time: **completed in 1 ms** (vs. ~27,000 ms for the real
     download) — proving the `.complete`-marker short-circuit never touches the network on a warm
     cache, i.e. genuinely offline-capable;
   - renders again against the cached artifacts: **also pixel-identical to the golden.**

**Result: PASSED**, both renders bit-for-bit matching the golden corpus. This closes the "clean-
profile smoke" requirement and is the strongest evidence available in this environment that debt #1
(real host spawn wiring) is genuinely closed, not just wired-and-untested.

**Known gap in this smoke test vs. a literal fresh user account:** it exercises `ArtifactManager` +
`JdkLocator` + `buildJavaCommand` + a raw LSP-framed spawn directly (the same production classes
`activation.ts` calls), but does NOT drive it through the real VS Code `activate()` /
`vscode.window.withProgress` / guided-setup-message UI layer (that layer is exercised separately by
the `test:integration` suite using the scripted fake host, since a real ~170 MB download on every
CI/test run would be prohibitively slow and network-flaky). Re-run `extension/src/test/smoke.ts`
manually before each real release to keep this evidence current — it is intentionally NOT part of
`npm run test:integration` or CI.

## Debt #1 closure summary (T60)

| Item | Status |
| ---- | ------ |
| (a) Host fat-jar built + embedded | Done — `host/build.gradle.kts`'s `shadowJar`, copied to `extension/host.jar` by `npm run package` |
| (b) `activation.ts::resolveHostCommand()` real path | Done — `prepareRealHost()` (JdkLocator + ArtifactManager + `buildJavaCommand`), invoked lazily on first `openPreview`/`restartHost` (P1-H AC1, NFR-02) |
| (c) `framework-delegates.jar` generation at engine-setup time | Done — `ArtifactManager.runGeneration()` invokes the packaged `host.jar`'s `engine.FrameworkDelegateGeneratorKt`/`engine.RClassGeneratorKt` as subprocesses after the raw downloads complete |
| (d) Live `inflate.doctor` / `inflate.clearEngineCache` command handlers | Done — wired to `assembleDoctorReport`/`formatDoctorReport` (T19) and a real `ArtifactManager.clear()` |
| (e) Clean-profile smoke | Done — see above, PASSED |

Two additional real, previously-undiscovered gaps were found and fixed as necessary prerequisites
(both required for ANY of the above to actually work against a real project, not just this batch's
fixtures) — see `docs/limitations.md` and `.specs/STATE.md` for full detail:

- `RenderRequest`/`ListThemesParams.packageName` must always be the fixed `ENGINE_PACKAGE_NAME`
  (`com.inflate.preview`), never the previewed project's real manifest package.
- `HostManager` previously rejected a second concurrent `render()` call instead of queuing it,
  contradicting NFR-05's "renders serialized per host" — fixed with a FIFO queue.
- (Packaging-specific) `RClassGenerator`'s subprocess needs the downloaded `sdk-common`/`common`/
  `layoutlib-api` jars on its classpath (AGP's symbol-table machinery) — these are NOT in the fat-jar
  (excluded per AD-011) — caught by the clean-profile smoke test itself (`NoClassDefFoundError:
  SymbolIo`) and fixed in `ArtifactManager`'s generation wiring.

## Settings + commands shipped (cross-check against README.md)

- Commands: `inflate.openPreview`, `inflate.refreshPreview`, `inflate.doctor`,
  `inflate.clearEngineCache`, `inflate.restartHost` — all live-wired (no stubs remain).
- Settings: `inflate.javaHome`, `inflate.resourceRoots`, `inflate.hostMaxHeap`,
  `inflate.renderTimeoutMs` — all now actually read from `vscode.workspace.getConfiguration('inflate')`
  (previously designed/tested at the unit level via injectable deps, but never wired to real VS Code
  configuration until this task).
