# Multi-platform support checks

Build: `cd extension && npm run build`; `cd extension && npx tsc -p tsconfig.json --noEmit`; `cd extension && npx tsc -p tsconfig.test.json --noEmit`; `cd corpus && npx tsc --noEmit`; `cd host && ./gradlew build --console=plain`
Run unit: `cd extension && npx vitest run --reporter=verbose`
Run integration: `cd extension && npm run test:integration`
Run corpus-unit: `cd corpus && npx vitest run --reporter=verbose`
Run ci-macos: `bash .specs/features/multi-platform-support/proofs/ci.sh macos-26`
Run ci-windows: `bash .specs/features/multi-platform-support/proofs/ci.sh windows-2025`
Run ci-linux: `bash .specs/features/multi-platform-support/proofs/ci.sh ubuntu-26.04`
Plan: `.specs/features/multi-platform-support/plan.md`

30 checks in 6 slices · 4 one-way doors · 0 open, of which 0 block

The `ci-*` runs read the newest completed `ci.yml` run on `feature/multi-platform-support` whose
code (everything outside `.specs/`) is identical to `HEAD`, and print its jobs, artifacts, the
runner job's steps (`✓` success) and the job's log.

## Checks

### S1 - A Windows x64 user previews a layout

**C1** - `hostArchFor` returns the classifier for the four supported pairs and unsupported for every other pair (AC 1)
Proof: run unit | ✓ src/artifacts.test.ts > hostArchFor > maps win32/x64 to win
Proof: run unit | ✓ src/artifacts.test.ts > hostArchFor > maps linux/x64 to linux
Proof: run unit | ✓ src/artifacts.test.ts > hostArchFor > maps darwin/arm64 to mac-arm
Proof: run unit | ✓ src/artifacts.test.ts > hostArchFor > maps darwin/x64 to mac
Proof: run unit | ✓ src/artifacts.test.ts > hostArchFor > maps win32/arm64 to unsupported
Proof: run unit | ✓ src/artifacts.test.ts > hostArchFor > maps linux/arm64 to unsupported
Proof: run unit | ✓ src/artifacts.test.ts > hostArchFor > maps win32/ia32 to unsupported
Proof: run unit | ✓ src/artifacts.test.ts > hostArchFor > maps freebsd/x64 to unsupported

**C2** - On Windows x64 `ArtifactManager` downloads `layoutlib-runtime-14.0.11-win.jar` (75,218,785 bytes, SHA-256 `3e26acb0…63bd`) and no other `layoutlib-runtime` file (AC 2)
Proof: run unit | ✓ src/artifacts.test.ts > engine-manifest.json > pins layoutlib-runtime-14.0.11-win.jar at 75218785 bytes and SHA-256 3e26acb000bd2c10bf44da72303622e059febbdd5f9facb461ea77f4151e63bd
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — runtime per platform > downloads layoutlib-runtime-14.0.11-win.jar and no other runtime on win
Proof: run ci-windows | [smoke] done: com.android.tools.layoutlib:layoutlib-runtime:14.0.11:win (75218785 bytes)

**C3** - `extension/engine-manifest.json` has exactly four `layoutlib-runtime` entries (`mac-arm`, `mac`, `win`, `linux`) and `./gradlew generateEngineManifest` rewrites it byte for byte (AC 3)
Proof: run unit | ✓ src/artifacts.test.ts > engine-manifest.json > lists exactly the mac-arm, mac, win and linux layoutlib-runtime entries
Proof: `cd host && ./gradlew generateEngineManifest --console=plain && git diff --exit-code -- ../extension/engine-manifest.json`

**C4** - `EngineArtifacts.detectArch(osArch, osName)` maps the OS before the CPU: (`amd64`, `Windows Server 2025`) → `WINDOWS_X64`, (`amd64`, `Linux`) → `LINUX_X64`, (`aarch64`, `Mac OS X`) → `MAC_ARM`, (`x86_64`, `Mac OS X`) → `MAC_X64` (AC 4)
Proof: `cd host && ./gradlew test --console=plain --tests 'engine.EngineArtifactsTest.os_name on Windows and Linux maps to their x64 HostArch'`
Proof: `cd host && ./gradlew test --console=plain --tests 'engine.EngineArtifactsTest.os_arch on macOS maps to the mac HostArch'`

**C5** - On `win32` `JdkLocator` searches `inflate.javaHome`, `JAVA_HOME`, `PATH` (`java.exe`), `%ProgramFiles%\Java\*`, `%ProgramFiles%\Microsoft\jdk-*`, `%ProgramFiles%\Eclipse Adoptium\*`, `%ProgramFiles%\Zulu\*`, `%ProgramFiles%\Android\Android Studio\jbr` in this order, the first source with a JDK 17+ wins, and `javaBin` is `<home>\bin\java.exe` (AC 5)
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in inflate.javaHome before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in JAVA_HOME before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in PATH before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in %ProgramFiles%\Java\* before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in %ProgramFiles%\Microsoft\jdk-* before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in %ProgramFiles%\Eclipse Adoptium\* before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in %ProgramFiles%\Zulu\* before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in %ProgramFiles%\Android\Android Studio\jbr before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > finds C:\Program Files\Microsoft\jdk-17.0.13.11-hotspot when it is the only JDK, with javaBin bin\java.exe
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > uses C:\Program Files when ProgramFiles is unset
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on win32 > prefers the JDK 17 under %ProgramFiles%\Zulu\ over a JDK 11 in JAVA_HOME

**C6** - Every child process the extension owns (host JVM, `FrameworkDelegateGeneratorKt`, `RClassGeneratorKt`) starts with `windowsHide: true` (AC 6)
Proof: run unit | ✓ src/host.test.ts > HostManager > spawns the host JVM with windowsHide
Proof: run unit | ✓ src/artifacts.test.ts > defaultGenerate > runs FrameworkDelegateGeneratorKt and RClassGeneratorKt with windowsHide

**C7** - The packaged `host.jar` contains `com/sun/jna/platform/win32/` classes and the VSIX is at most 50,000,000 bytes (AC 7)
Proof: `npm run package > /dev/null 2>&1 && unzip -l extension/host.jar | grep -q ' com/sun/jna/platform/win32/' && [ $(wc -c < extension/inflate-1.0.3.vsix) -le 50000000 ]`
Proof: run ci-windows | host.jar holds com/sun/jna/platform/win32/ classes
Proof: run ci-windows | VSIX size at most 50000000 bytes

**C8** - A layout with CRLF line endings matches the LF golden of the same layout at 0.000% on all three runners (AC 8)
Proof: run corpus-unit | ✓ lineEndings.test.ts > line-endings/crlf fixture > ends every line with CRLF
Proof: run corpus-unit | ✓ lineEndings.test.ts > line-endings/crlf fixture > holds the gradle/main layout apart from line endings
Proof: run ci-macos | [corpus] PASS line-endings/crlf :: default (0.000% diff vs gradle/main)
Proof: run ci-windows | [corpus] PASS line-endings/crlf :: default (0.000% diff vs gradle/main)
Proof: run ci-linux | [corpus] PASS line-endings/crlf :: default (0.000% diff vs gradle/main)

**C9** - On `windows-2025` every CI step passes: extension unit tests, all 34 extension integration tests, host build and unit tests, engineTest, the corpus and the clean-profile smoke (AC 9; 34 settled mid-build)
Proof: run ci-windows | job build-and-test (windows-2025) conclusion: success
Proof: run ci-windows | ✓ Extension unit tests
Proof: run ci-windows | ✓ Extension integration tests
Proof: run ci-windows | 34 passing
Proof: run ci-windows | ✓ Host build + unit tests
Proof: run ci-windows | ✓ Host engine integration tests
Proof: run ci-windows | ✓ Golden-image corpus
Proof: run ci-windows | ✓ Clean-profile smoke

**C10** - On `windows-2025` the host engine cache lives in `INFLATE_ENGINE_CACHE_DIR`, a folder of 177 characters, so its longest file path is 280 characters (AC 10)
Proof: run ci-windows | INFLATE_ENGINE_CACHE_DIR is 177 characters; longest engine cache file path is 280 characters; host/.engine-cache absent

### S2 - A Linux x64 user previews a layout

**C11** - On Linux x64 `ArtifactManager` downloads `layoutlib-runtime-14.0.11-linux.jar` and no other `layoutlib-runtime` file (AC 11)
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — runtime per platform > downloads layoutlib-runtime-14.0.11-linux.jar and no other runtime on linux
Proof: run ci-linux | [smoke] done: com.android.tools.layoutlib:layoutlib-runtime:14.0.11:linux

**C12** - On `linux` `JdkLocator` searches `inflate.javaHome`, `JAVA_HOME`, `PATH`, `/usr/lib/jvm/*`, `~/.sdkman/candidates/java/*` (skipping `current`), `/opt/android-studio/jbr`, `~/android-studio/jbr` in this order and `javaBin` is `<home>/bin/java` (AC 12)
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in inflate.javaHome before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in JAVA_HOME before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in PATH before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in /usr/lib/jvm/* before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in ~/.sdkman/candidates/java/* before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in /opt/android-studio/jbr before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in ~/android-studio/jbr before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on linux > skips the SDKMAN current link
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on linux > finds /usr/lib/jvm/java-17-openjdk-amd64 when it is the only JDK, with javaBin bin/java
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 21 in ~/android-studio/jbr when it is the only JDK

**C13** - On `darwin` `JdkLocator` keeps the `main` sources and order: `inflate.javaHome`, `JAVA_HOME`, `PATH`, `/usr/libexec/java_home -V`, Homebrew, SDKMAN, Android Studio JBR, `/Library/Java/JavaVirtualMachines/*` (AC 13)
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in inflate.javaHome before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in JAVA_HOME before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in PATH before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in /usr/libexec/java_home -V before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in Homebrew before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in SDKMAN before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in Android Studio JBR before the sources after it
Proof: run unit | ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in /Library/Java/JavaVirtualMachines/* before the sources after it

**C14** - On `ubuntu-26.04` every CI step passes, with the integration tests under a virtual display (AC 14)
Proof: run ci-linux | job build-and-test (ubuntu-26.04) conclusion: success
Proof: run ci-linux | ✓ Extension unit tests
Proof: run ci-linux | Running the integration tests under xvfb-run
Proof: run ci-linux | 34 passing
Proof: run ci-linux | ✓ Extension integration tests
Proof: run ci-linux | ✓ Host build + unit tests
Proof: run ci-linux | ✓ Host engine integration tests
Proof: run ci-linux | ✓ Golden-image corpus
Proof: run ci-linux | ✓ Clean-profile smoke

### S3 - Windows and Linux on Arm are refused before any download

**C15** - On an unsupported pair the preview stops before the JDK lookup and the download: the panel shows `Inflate does not support <OS> on <arch>: the rendering engine is published for Windows x64, Linux x64 and macOS only.`, a warning shows the same text after `Inflate: ` with no buttons, and nothing is created under `globalStorage/engine/` (AC 15)
Proof: run unit | ✓ src/artifacts.test.ts > unsupportedPlatformMessage > names Windows on arm64
Proof: run unit | ✓ src/artifacts.test.ts > unsupportedPlatformMessage > names Linux on arm64
Proof: run unit | ✓ src/artifacts.test.ts > unsupportedPlatformMessage > names freebsd on x64
Proof: run integration | ✔ refuses win32/arm64 before setup: panel error, a warning with no buttons, no engine folder

**C16** - `Inflate: Doctor` prints a `-- Platform --` section (`  darwin arm64: supported (natives: mac-arm)`, `  win32 arm64: not supported`) and still prints every other section on an unsupported platform (AC 16)
Proof: run unit | ✓ src/doctor.test.ts > formatDoctorReport — platform > prints darwin arm64: supported (natives: mac-arm) under -- Platform --
Proof: run unit | ✓ src/doctor.test.ts > formatDoctorReport — platform > prints win32 arm64: not supported and every other section

### S4 - macOS users update without anything breaking

**C17** - With the 1.0.x folder `engine/0bd4cefe7c97ece892dd21ac76094d2297943c1c1cdb5ee5be8500ee5f5ef903` present, the first preview after updating installs into `engine/<new manifest hash>/` and leaves the old folder in place (AC 17)
Proof: run unit | ✓ src/artifacts.test.ts > engine-manifest.json > has a hash other than the 1.0.x engine folder 0bd4cefe7c97ece892dd21ac76094d2297943c1c1cdb5ee5be8500ee5f5ef903
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > installs into engine/<new hash>/ and leaves the 1.0.x folder in place

**C18** - When the current `engine/<hash>/.complete` is at least 7 days old, engine setup deletes every other child of `globalStorage/engine/` last written before it, never the current folder and nothing outside `engine/` (AC 18, amended 2026-11-21)
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > deletes nothing when the current folder completed 6 days 23 hours ago
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > deletes every other folder when the current folder completed exactly 7 days ago
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > does nothing when no other folder exists
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > deletes an old folder holding only a tmp/ partial download
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > never deletes the current folder or anything outside engine/

**C29** - On an unsupported platform `Inflate: Clear Engine Cache` still deletes the current `engine/<hash>/` folder, and an `ArtifactManager` with no platform classifier refuses to install (plan: Changes underneath, `HostArch` readers)
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — unsupported platform > clears the current engine folder
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — unsupported platform > refuses to install

**C30** - Engine setup never deletes a folder written after the current `.complete`: a newer version's folder, finished or still downloading, is kept (AC 18 amended 2026-11-21, Verifier finding)
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > keeps a folder written after the current one completed, finished or still downloading

**C19** - When deleting an old engine folder fails, engine setup still returns the engine paths, logs `[setup] could not remove old engine folder <folder name>: <error message>`, and the next setup tries again (AC 19)
Proof: run unit | ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > logs a failed delete, still returns the engine paths and retries at the next setup

### S5 - CI proves the shipped package on all three systems

**C20** - On each of `macos-26`, `windows-2025` and `ubuntu-26.04` CI builds `host.jar` and the VSIX with `npm run package`, then the clean-profile smoke downloads the real manifest's engine into an empty profile, renders through the packaged `host.jar`, and runs a second `ensureInstalled` and render with no network call (AC 20)
Proof: run ci-macos | ✓ Package host.jar and the VSIX
Proof: run ci-macos | [smoke] Run 1 render OK through the packaged host.jar
Proof: run ci-macos | [smoke] Run 2 ensureInstalled made no network call
Proof: run ci-macos | [smoke] SMOKE TEST PASSED
Proof: run ci-windows | ✓ Package host.jar and the VSIX
Proof: run ci-windows | [smoke] Run 1 render OK through the packaged host.jar
Proof: run ci-windows | [smoke] Run 2 ensureInstalled made no network call
Proof: run ci-windows | [smoke] SMOKE TEST PASSED
Proof: run ci-linux | ✓ Package host.jar and the VSIX
Proof: run ci-linux | [smoke] Run 1 render OK through the packaged host.jar
Proof: run ci-linux | [smoke] Run 2 ensureInstalled made no network call
Proof: run ci-linux | [smoke] SMOKE TEST PASSED

**C21** - On `windows-2025` the smoke's clean-profile folder puts the longest engine file path above 260 characters (AC 21)
Proof: run ci-windows | [smoke] longest engine file path: characters (above 260)

**C22** - The corpus keeps `fonts/custom`: one layout applying `@font/dancing_script` through a `TextView`, a `MaterialTextView` and a `MaterialButton`, with a committed golden that passes at 0.000% on all three runners (AC 22)
Proof: `test "$(grep -c 'android:fontFamily="@font/dancing_script"' fixtures/galleries/fonts/res/layout/custom_fonts.xml)" = 3 && grep -q '<TextView' fixtures/galleries/fonts/res/layout/custom_fonts.xml && grep -q '<com.google.android.material.textview.MaterialTextView' fixtures/galleries/fonts/res/layout/custom_fonts.xml && grep -q '<com.google.android.material.button.MaterialButton' fixtures/galleries/fonts/res/layout/custom_fonts.xml && git ls-files --error-unmatch fixtures/galleries/fonts/golden/fonts-custom__default.png`
Proof: run ci-macos | [corpus] PASS fonts/custom :: default (0.000% diff)
Proof: run ci-windows | [corpus] PASS fonts/custom :: default (0.000% diff)
Proof: run ci-linux | [corpus] PASS fonts/custom :: default (0.000% diff)

**C23** - The CI engine cache key contains `runner.os` and the hash of `extension/engine-manifest.json` (AC 23)
Proof: `test "$(grep -c "key: engine-cache-\${{ runner.os }}-\${{ hashFiles('extension/engine-manifest.json') }}" .github/workflows/ci.yml)" = 2`
Proof: run ci-macos | key: engine-cache-macOS-
Proof: run ci-windows | key: engine-cache-Windows-
Proof: run ci-linux | key: engine-cache-Linux-

**C24** - CI is one job whose matrix lists `macos-26`, `windows-2025` and `ubuntu-26.04`, with one list of steps for all three, and each runner uploads `corpus-report-<runner.os>` (AC 24)
Proof: `test "$(grep -c 'runs-on:' .github/workflows/ci.yml)" = 1 && grep -q 'runner: \[macos-26, windows-2025, ubuntu-26.04\]' .github/workflows/ci.yml && grep -q 'name: corpus-report-\${{ runner.os }}' .github/workflows/ci.yml`
Proof: run ci-macos | run jobs: build-and-test (macos-26), build-and-test (windows-2025), build-and-test (ubuntu-26.04)
Proof: run ci-macos | job build-and-test (macos-26) conclusion: success
Proof: run ci-macos | artifact: corpus-report-macOS
Proof: run ci-windows | artifact: corpus-report-Windows
Proof: run ci-linux | artifact: corpus-report-Linux

### S6 - The release notes and the store page say what ships

**C25** - `extension/CHANGELOG.md` opens with the `## 1.1.0` section of criterion 25, word for word (AC 25)
Proof: `python3 .specs/features/multi-platform-support/proofs/docs.py changelog`

**C26** - `extension/README.md` and `README.md` state `Inflate runs on macOS (Apple Silicon and Intel), Windows x64 and Linux x64. Windows on Arm and Linux on Arm are not supported.` and their Quickstart names `Cmd+Shift+P` on macOS and `Ctrl+Shift+P` on Windows and Linux (AC 26)
Proof: `python3 .specs/features/multi-platform-support/proofs/docs.py readme`

**C27** - `docs/troubleshooting.md` lists the JDK search order of macOS, Windows and Linux, and `docs/limitations.md` replaces the v1 "Windows and Linux are not supported" bullet with the Arm limitation (AC 27)
Proof: `python3 .specs/features/multi-platform-support/proofs/docs.py troubleshooting`
Proof: `python3 .specs/features/multi-platform-support/proofs/docs.py limitations`

**C28** - `.specs/STATE.md` records AD-028 and AD-029, and AD-004's status is `superseded by AD-028` (AC 28)
Proof: `grep -q '^### AD-028' .specs/STATE.md && grep -q '^### AD-029' .specs/STATE.md && awk '/^### AD-004/{f=1} f && /Status/{print; exit}' .specs/STATE.md | grep -qF 'superseded by AD-028'`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `hostArchFor` pairs, AC 1 (8) | `win32/x64` C1 · `linux/x64` C1 · `darwin/arm64` C1 · `darwin/x64` C1 · `win32/arm64` C1 · `linux/arm64` C1 · `win32/ia32` C1 · `freebsd/x64` C1 | - |
| readers of the platform pair (5) | `selectRelevantArtifacts` C2, C11 · `ensureRealHostConfigured` (preview, retry, restart) C15 · `Inflate: Doctor` C16 · `smoke.ts` C20 · `Inflate: Clear Engine Cache` C29 | - |
| runtime classifiers in the manifest (4) | `mac-arm` C3 · `mac` C3 · `win` C3, C2 · `linux` C3, C11 | - |
| `detectArch` examples, AC 4 (4) | Windows Server 2025 C4 · Linux C4 · aarch64 Mac OS X C4 · x86_64 Mac OS X C4 | - |
| Windows JDK sources, AC 5 (8) | `inflate.javaHome` C5 · `JAVA_HOME` C5 · `PATH` C5 · `Java\*` C5 · `Microsoft\jdk-*` C5 · `Eclipse Adoptium\*` C5 · `Zulu\*` C5 · `Android Studio\jbr` C5 | - |
| Windows JDK examples, AC 5 (3) | Microsoft jdk-17.0.13.11 only C5 · `ProgramFiles` unset C5 · JDK 11 `JAVA_HOME` + JDK 17 Zulu C5 | - |
| Linux JDK sources, AC 12 (7) | `inflate.javaHome` C12 · `JAVA_HOME` C12 · `PATH` C12 · `/usr/lib/jvm/*` C12 · SDKMAN C12 · `/opt/android-studio/jbr` C12 · `~/android-studio/jbr` C12 | - |
| Linux JDK examples, AC 12 (2) | `java-17-openjdk-amd64` only C12 · `~/android-studio/jbr` JDK 21 only C12 | - |
| macOS JDK sources, AC 13 (8) | `inflate.javaHome` C13 · `JAVA_HOME` C13 · `PATH` C13 · `java_home -V` C13 · Homebrew C13 · SDKMAN C13 · Android Studio JBR C13 · `JavaVirtualMachines` C13 | - |
| child processes the extension owns, AC 6 (3) | host JVM C6 · `FrameworkDelegateGeneratorKt` C6 · `RClassGeneratorKt` C6 | - |
| unsupported-pair examples, AC 15 (3) | `win32/arm64` C15 · `linux/arm64` C15 · `freebsd/x64` C15 | - |
| Doctor platform lines, AC 16 (2) | `darwin arm64` C16 · `win32 arm64` C16 | - |
| retention rule examples, AC 18 (5) | 6 days 23 hours C18 · exactly 7 days C18 · no other folder C18 · only `tmp/` C18 · newer folder C30 | - |
| engine folder transitions this feature adds, plan state diagram (3) | Complete -> Superseded C17 · Superseded -> Deleted C18 · Superseded -> Superseded on a failed delete C19 | - |
| CI runners, AC 9/14/20/24 (3) | `macos-26` C24, C20, C8, C22 · `windows-2025` C9, C10, C21, C20, C8, C22 · `ubuntu-26.04` C14, C20, C8, C22 | - |
| Landing doors (4) | door 1 manifest and hash C3, C17 · door 2 retention C18, C19, C30 · door 3 platforms C1, C15 · door 4 release gate C24, C20 | - |
| docs and decisions, AC 25-28 (6 files) | `extension/CHANGELOG.md` C25 · `extension/README.md` C26 · `README.md` C26 · `docs/troubleshooting.md` C27 · `docs/limitations.md` C27 · `.specs/STATE.md` C28 | - |

## Swept

- validation: C1 - every platform pair outside the four supported ones is refused, including 32-bit and other OSes
- failure modes: C19 (old folder delete fails), C15 (unsupported platform stops before any work)
- idempotency: C3 (generator rerun is byte-identical), C20 (second `ensureInstalled` makes no network call)
- authorization: n/a - no account, permission or network-facing surface changes
- concurrency: C18 - the 7-day grace leaves the old folder to a window still on the previous version; C30 - a window still on an older version never deletes a newer version's folder; a second window pruning the same folder at once hits `rmSync` with `force`, and a failure is C19
- data lifecycle: C17 (new hash, old folder kept), C18 (old folders deleted 7 days after the new one completes)
- dependency failure: existing - `OfflineError` when Google Maven is unreachable (`artifacts.test.ts`), `GuidedError` when no JDK 17 is found (`jdk.test.ts`)
- state transitions: C17, C18, C19; the unchanged Downloading -> Complete and Downloading -> Downloading transitions stay on the existing `artifacts.test.ts` install and half-installed-cache tests
- observability: C19 (`[setup]` log line), C16 (Doctor platform line)

## Handoff

- **Settled mid-build:** 2026-11-21, user: push and run CI "Yes, push and run CI" (fast-forward pushes of this branch, on-demand CI runs, no force); integration count "Yes, 34 is fine (Recommended)" (criterion 9 reads all integration tests, now 34, with the new refusal test); panel text for the Arm refusal "Keep the prefix" (the panel shows `Render host error: Inflate does not support ...`, same path as the missing-JDK message); Verifier finding on the 7-day cleanup (an older window deletes a newer version's folder) "Delete only older folders" (delete another folder only when it was last written before the current `.complete`: its own `.complete` time, or its latest change when it has none; amends AD-029, door 2 and criterion 18); Verifier finding on the C19 log wiring: "What's the best think to do here? I think is make the log required, but I don't want to make overengineering." (answered: `log` becomes a required `ArtifactManagerOptions` field, no new abstraction)
- **Dispatched:** Verifier at `4b36b17` (proofs.md 127/127 at `4b36b17`, diff `main..4b36b17`), sent 2026-11-21, returned FAIL with 3 findings; no screens sub-agent (no criterion cites a capture)
- **Boundary:** C1-C29 closed at `a22cdd7`. CI run 44862527604 at `94a4c4f`: macOS and Linux green; Windows failed 2 suite cleanups (EPERM deleting fixtures saved through VS Code) and the crash-limit chaos test past its 90 s budget (51 s macOS/Linux, 78 s Windows in the spike run), fixed in `c6e1294` and `5f31c1c`; CI echoes made discriminating in `a22cdd7` (GitHub prints each step's script into the log). CI run 44863585240 at `a22cdd7`: all three green; its Linux job was re-run once after Maven Central answered HTTP 429 while Gradle resolved the Shadow plugin. `proofs/ci.sh` prints the run's job names in the run's own matrix order, because a re-run changes the API's job order
- **Abandoned:** none
