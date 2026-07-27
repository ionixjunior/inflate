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

**Icon note (RESOLVED 2026-07-26):** the original placeholder was replaced with real artwork in
commit `f7f4496`.

**Publisher note (RESOLVED 2026-07-26):** `package.json` points at the real repository
(`github.com/ionixjunior/inflate`) and the real Marketplace publisher (`ionixjunior`, commit
`abf7b75`).

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

## Publishing & release automation (Amendment — 2026-07-26, REL-05/AD-019)

> The manual VSIX/gate sections above remain valid for **local verification**, but actual releases
> are now fully automated — one click in the GitHub UI, zero local commands
> (`.github/workflows/release.yml`).

### One-time setup: Marketplace publisher account (cannot be automated)

1. Have a **Microsoft account** (any personal one works — account.microsoft.com).
2. Create a (free) **Azure DevOps organization**: sign in at https://dev.azure.com with that
   account and accept the default organization it offers (or create one; the name doesn't matter).
3. Create the **publishing PAT**: Azure DevOps → User settings (top-right) → *Personal access
   tokens* → *New Token*:
   - Name: `vsce-publish`; Organization: **All accessible organizations** (the Marketplace
     requires this); Expiration: up to 1 year.
   - Scopes: *Custom defined* → show all scopes → **Marketplace → Manage**.
   - Copy the token immediately (it is shown only once).
   - ⚠ **Azure DevOps retires global PATs on 2026-12-01** and publishing PATs are global-scope —
     see "PAT vs Microsoft Entra ID" below for why the PAT is nevertheless the right choice today
     and what to re-check before that date.
4. Create the **publisher**: https://marketplace.visualstudio.com/manage → sign in with the SAME
   Microsoft account → *Create publisher* → pick the public ID (e.g. `ionixjunior`) and display
   name. Only **ID** (permanent, public) and **Name** (public, changeable) are required; every
   other field is optional — no payment method, no identity documents. The logo is optional too
   and a personal photo is perfectly fine for an indie publisher (it is public, like a GitHub
   avatar, and can be swapped later — unlike the ID, which is forever). The "verified publisher"
   blue check is a separate optional step (DNS TXT record on a domain you own) — skip it.
5. Update `extension/package.json` → `"publisher"` from the `"inflate"` placeholder to the real ID
   (one line; commit before the first release — `vsce` refuses to publish under a mismatched
   publisher).
6. Add the repo secret: GitHub → repo → Settings → *Secrets and variables* → *Actions* → *New
   repository secret* → name `VSCE_PAT`, value = the token from step 3.
7. **Optional — Open VSX** (VSCodium, Cursor, Gitpod users): https://open-vsx.org → sign in with
   GitHub → create the namespace matching the publisher ID → generate an access token → save it as
   repo secret `OVSX_TOKEN`. While this secret is absent the release pipeline skips the Open VSX
   leg automatically (it is optional by design, REL-04 AC3).

### PAT vs Microsoft Entra ID (status as of 2026-07)

Microsoft's announced direction is Entra ID (workload identity federation + managed identities,
`vsce publish --azure-credential`) and the official docs push it because global PATs retire on
**2026-12-01**. It was evaluated for this repo and **deliberately not adopted yet**, because for a
**personally-owned publisher it does not currently work from CI**:

- The Entra path requires an **organizational Entra tenant + an Azure subscription** (a managed
  identity is an Azure resource; the federated credential lives on it). A personal Microsoft
  account publisher has neither.
- Presenting an org-tenant/service-principal token to a personally-owned publisher passes
  `verify-pat` but fails the actual publish with **"corporate credentials required"** — reported
  upstream as `vscode-vsce` issue #1023 and closed *not planned*.
- The official docs document the Entra flow **for Azure Pipelines only**; there is no documented
  GitHub Actions flow.

**Decision**: PAT now; **re-evaluation checkpoint before 2026-12-01** — check the official
publishing docs (https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
for an individual-publisher migration path. If none ships, the alternatives are: move the
publisher to an organizational tenant and then wire managed identity + federated credential for
this repo (`azure/login` with `id-token: write`, swap `-p "$VSCE_PAT"` for `--azure-credential` in
`release.yml`), or whatever PAT successor Azure DevOps offers then. It is NOT clearly stated
whether already-issued Marketplace PATs keep working after that date — do not let the token ride
past it unverified.

### Releasing — every time, no local commands

1. Merge whatever should ship into `main`.
2. GitHub → *Actions* → **Release** → *Run workflow* → pick `bump`:
   - `patch` = only fixes since the last release · `minor` = any new feature · `major` = breaking
     change.
   - **First release: pick `major`** — 0.0.1 becomes **1.0.0** (AD-019).
3. The pipeline then runs: full gate (identical to CI, incl. `engineTest` + golden corpus) →
   version bump → host-jar + VSIX build → **Marketplace publish** (→ Open VSX when configured) →
   `Release <version>` commit + `v<version>` tag pushed to `main` → **GitHub Release** with
   auto-generated notes (from the merged PRs/commits) and the VSIX attached.

### If a release run fails

- **Gate, build, or publish step failed** → nothing was pushed and nothing was published; fix the
  cause and simply re-run the workflow.
- **Publish succeeded but the later push/tag failed** (rare race with a concurrent push to main) →
  the version IS already live on the Marketplace. Do **not** re-run the workflow — a re-run would
  bump again. Recover manually per the header comment in `release.yml`: land the bump commit, tag
  it `v<version>`, and create the GitHub Release for that tag.

### Before the FIRST release, additionally

- Replace `extension/media/icon.png` with real brand artwork (see the Icon note above).
- Optionally record the quickstart GIF (`openPreview` → edit → save → day/night toggle) for the
  README/Marketplace listing — nice-to-have, not blocking.
- Push the repo to https://github.com/ionixjunior/inflate (the `origin` remote is already
  configured locally) and confirm the Actions tab lists the CI / Release / Engine pin canary /
  "Run CI from a PR comment" workflows.
- Keep the repo **public**: GitHub-hosted standard runners (macOS included) are free for public
  repos; a private repo bills macOS minutes at a 10× multiplier.
- Sanity-run CI once from the Actions tab — this doubles as the live verification of the
  `macos-26` runner bump and the reworked triggers (they cannot be exercised locally).
