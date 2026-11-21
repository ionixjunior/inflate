# multi-platform-support proofs

**HEAD**: 0ca0897
**Tree**: clean
**Shell**: /bin/sh
**Result**: 128 pass, 0 fail

| Check | Proof | Result |
| --- | --- | --- |
| C1 | `run unit / ✓ src/artifacts.test.ts > hostArchFor > maps win32/x64 to win` | pass |
| C1 | `run unit / ✓ src/artifacts.test.ts > hostArchFor > maps linux/x64 to linux` | pass |
| C1 | `run unit / ✓ src/artifacts.test.ts > hostArchFor > maps darwin/arm64 to mac-arm` | pass |
| C1 | `run unit / ✓ src/artifacts.test.ts > hostArchFor > maps darwin/x64 to mac` | pass |
| C1 | `run unit / ✓ src/artifacts.test.ts > hostArchFor > maps win32/arm64 to unsupported` | pass |
| C1 | `run unit / ✓ src/artifacts.test.ts > hostArchFor > maps linux/arm64 to unsupported` | pass |
| C1 | `run unit / ✓ src/artifacts.test.ts > hostArchFor > maps win32/ia32 to unsupported` | pass |
| C1 | `run unit / ✓ src/artifacts.test.ts > hostArchFor > maps freebsd/x64 to unsupported` | pass |
| C2 | `run unit / ✓ src/artifacts.test.ts > engine-manifest.json > pins layoutlib-runtime-14.0.11-win.jar at 75218785` | pass |
| C2 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — runtime per platform > downloads layoutlib-runtime-14.0` | pass |
| C2 | `run ci-windows / [smoke] done: com.android.tools.layoutlib:layoutlib-runtime:14.0.11:win (75218785 bytes)` | pass |
| C3 | `run unit / ✓ src/artifacts.test.ts > engine-manifest.json > lists exactly the mac-arm, mac, win and linux layo` | pass |
| C3 | `cd host && ./gradlew generateEngineManifest --console=plain && git diff --exit-code -- ../extension/engine-man` | pass |
| C4 | `cd host && ./gradlew test --console=plain --tests 'engine.EngineArtifactsTest.os_name on Windows and Linux map` | pass |
| C4 | `cd host && ./gradlew test --console=plain --tests 'engine.EngineArtifactsTest.os_arch on macOS maps to the mac` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in inflate.javaHome before the sources a` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in JAVA_HOME before the sources after it` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in PATH before the sources after it` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in %ProgramFiles%\Java\* before the sour` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in %ProgramFiles%\Microsoft\jdk-* before` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in %ProgramFiles%\Eclipse Adoptium\* bef` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in %ProgramFiles%\Zulu\* before the sour` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > finds the JDK 17 in %ProgramFiles%\Android\Android Studio` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > finds C:\Program Files\Microsoft\jdk-17.0.13.11-hotspot w` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > uses C:\Program Files when ProgramFiles is unset` | pass |
| C5 | `run unit / ✓ src/jdk.test.ts > resolveJdk on win32 > prefers the JDK 17 under %ProgramFiles%\Zulu\ over a JDK ` | pass |
| C6 | `run unit / ✓ src/host.test.ts > HostManager > spawns the host JVM with windowsHide` | pass |
| C6 | `run unit / ✓ src/artifacts.test.ts > defaultGenerate > runs FrameworkDelegateGeneratorKt and RClassGeneratorKt` | pass |
| C7 | `npm run package > /dev/null 2>&1 && unzip -l extension/host.jar / grep -q ' com/sun/jna/platform/win32/' && [ ` | pass |
| C7 | `run ci-windows / host.jar holds com/sun/jna/platform/win32/ classes` | pass |
| C7 | `run ci-windows / VSIX size at most 50000000 bytes` | pass |
| C8 | `run corpus-unit / ✓ lineEndings.test.ts > line-endings/crlf fixture > ends every line with CRLF` | pass |
| C8 | `run corpus-unit / ✓ lineEndings.test.ts > line-endings/crlf fixture > holds the gradle/main layout apart from ` | pass |
| C8 | `run ci-macos / [corpus] PASS line-endings/crlf :: default (0.000% diff vs gradle/main)` | pass |
| C8 | `run ci-windows / [corpus] PASS line-endings/crlf :: default (0.000% diff vs gradle/main)` | pass |
| C8 | `run ci-linux / [corpus] PASS line-endings/crlf :: default (0.000% diff vs gradle/main)` | pass |
| C9 | `run ci-windows / job build-and-test (windows-2025) conclusion: success` | pass |
| C9 | `run ci-windows / ✓ Extension unit tests` | pass |
| C9 | `run ci-windows / ✓ Extension integration tests` | pass |
| C9 | `run ci-windows / 34 passing` | pass |
| C9 | `run ci-windows / ✓ Host build + unit tests` | pass |
| C9 | `run ci-windows / ✓ Host engine integration tests` | pass |
| C9 | `run ci-windows / ✓ Golden-image corpus` | pass |
| C9 | `run ci-windows / ✓ Clean-profile smoke` | pass |
| C10 | `run ci-windows / INFLATE_ENGINE_CACHE_DIR is 177 characters; longest engine cache file path is 280 characters;` | pass |
| C11 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — runtime per platform > downloads layoutlib-runtime-14.0` | pass |
| C11 | `run ci-linux / [smoke] done: com.android.tools.layoutlib:layoutlib-runtime:14.0.11:linux` | pass |
| C12 | `run unit / ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in inflate.javaHome before the sources a` | pass |
| C12 | `run unit / ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in JAVA_HOME before the sources after it` | pass |
| C12 | `run unit / ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in PATH before the sources after it` | pass |
| C12 | `run unit / ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in /usr/lib/jvm/* before the sources aft` | pass |
| C12 | `run unit / ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in ~/.sdkman/candidates/java/* before th` | pass |
| C12 | `run unit / ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in /opt/android-studio/jbr before the so` | pass |
| C12 | `run unit / ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 17 in ~/android-studio/jbr before the sourc` | pass |
| C12 | `run unit / ✓ src/jdk.test.ts > resolveJdk on linux > skips the SDKMAN current link` | pass |
| C12 | `run unit / ✓ src/jdk.test.ts > resolveJdk on linux > finds /usr/lib/jvm/java-17-openjdk-amd64 when it is the o` | pass |
| C12 | `run unit / ✓ src/jdk.test.ts > resolveJdk on linux > finds the JDK 21 in ~/android-studio/jbr when it is the o` | pass |
| C13 | `run unit / ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in inflate.javaHome before the sources ` | pass |
| C13 | `run unit / ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in JAVA_HOME before the sources after i` | pass |
| C13 | `run unit / ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in PATH before the sources after it` | pass |
| C13 | `run unit / ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in /usr/libexec/java_home -V before the` | pass |
| C13 | `run unit / ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in Homebrew before the sources after it` | pass |
| C13 | `run unit / ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in SDKMAN before the sources after it` | pass |
| C13 | `run unit / ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in Android Studio JBR before the source` | pass |
| C13 | `run unit / ✓ src/jdk.test.ts > resolveJdk on darwin > finds the JDK 17 in /Library/Java/JavaVirtualMachines/* ` | pass |
| C14 | `run ci-linux / job build-and-test (ubuntu-26.04) conclusion: success` | pass |
| C14 | `run ci-linux / ✓ Extension unit tests` | pass |
| C14 | `run ci-linux / Running the integration tests under xvfb-run` | pass |
| C14 | `run ci-linux / 34 passing` | pass |
| C14 | `run ci-linux / ✓ Extension integration tests` | pass |
| C14 | `run ci-linux / ✓ Host build + unit tests` | pass |
| C14 | `run ci-linux / ✓ Host engine integration tests` | pass |
| C14 | `run ci-linux / ✓ Golden-image corpus` | pass |
| C14 | `run ci-linux / ✓ Clean-profile smoke` | pass |
| C15 | `run unit / ✓ src/artifacts.test.ts > unsupportedPlatformMessage > names Windows on arm64` | pass |
| C15 | `run unit / ✓ src/artifacts.test.ts > unsupportedPlatformMessage > names Linux on arm64` | pass |
| C15 | `run unit / ✓ src/artifacts.test.ts > unsupportedPlatformMessage > names freebsd on x64` | pass |
| C15 | `run integration / ✔ refuses win32/arm64 before setup: panel error, a warning with no buttons, no engine folder` | pass |
| C16 | `run unit / ✓ src/doctor.test.ts > formatDoctorReport — platform > prints darwin arm64: supported (natives: mac` | pass |
| C16 | `run unit / ✓ src/doctor.test.ts > formatDoctorReport — platform > prints win32 arm64: not supported and every ` | pass |
| C17 | `run unit / ✓ src/artifacts.test.ts > engine-manifest.json > has a hash other than the 1.0.x engine folder 0bd4` | pass |
| C17 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > installs into engine/<new hash>/ a` | pass |
| C18 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > deletes nothing when the current f` | pass |
| C18 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > deletes every other folder when th` | pass |
| C18 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > does nothing when no other folder ` | pass |
| C18 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > deletes an old folder holding only` | pass |
| C18 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > never deletes the current folder o` | pass |
| C29 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — unsupported platform > clears the current engine folder` | pass |
| C29 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — unsupported platform > refuses to install` | pass |
| C30 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > keeps a folder written after the c` | pass |
| C19 | `run unit / ✓ src/artifacts.test.ts > ArtifactManager — old engine folders > logs a failed delete, still return` | pass |
| C20 | `run ci-macos / ✓ Package host.jar and the VSIX` | pass |
| C20 | `run ci-macos / [smoke] Run 1 render OK through the packaged host.jar` | pass |
| C20 | `run ci-macos / [smoke] Run 2 ensureInstalled made no network call` | pass |
| C20 | `run ci-macos / [smoke] SMOKE TEST PASSED` | pass |
| C20 | `run ci-windows / ✓ Package host.jar and the VSIX` | pass |
| C20 | `run ci-windows / [smoke] Run 1 render OK through the packaged host.jar` | pass |
| C20 | `run ci-windows / [smoke] Run 2 ensureInstalled made no network call` | pass |
| C20 | `run ci-windows / [smoke] SMOKE TEST PASSED` | pass |
| C20 | `run ci-linux / ✓ Package host.jar and the VSIX` | pass |
| C20 | `run ci-linux / [smoke] Run 1 render OK through the packaged host.jar` | pass |
| C20 | `run ci-linux / [smoke] Run 2 ensureInstalled made no network call` | pass |
| C20 | `run ci-linux / [smoke] SMOKE TEST PASSED` | pass |
| C21 | `run ci-windows / [smoke] longest engine file path: characters (above 260)` | pass |
| C22 | `test "$(grep -c 'android:fontFamily="@font/dancing_script"' fixtures/galleries/fonts/res/layout/custom_fonts.x` | pass |
| C22 | `run ci-macos / [corpus] PASS fonts/custom :: default (0.000% diff)` | pass |
| C22 | `run ci-windows / [corpus] PASS fonts/custom :: default (0.000% diff)` | pass |
| C22 | `run ci-linux / [corpus] PASS fonts/custom :: default (0.000% diff)` | pass |
| C23 | `test "$(grep -c "key: engine-cache-\${{ runner.os }}-\${{ hashFiles('extension/engine-manifest.json') }}" .git` | pass |
| C23 | `run ci-macos / key: engine-cache-macOS-` | pass |
| C23 | `run ci-windows / key: engine-cache-Windows-` | pass |
| C23 | `run ci-linux / key: engine-cache-Linux-` | pass |
| C24 | `test "$(grep -c 'runs-on:' .github/workflows/ci.yml)" = 1 && grep -q 'runner: \[macos-26, windows-2025, ubuntu` | pass |
| C24 | `run ci-macos / run jobs: build-and-test (macos-26), build-and-test (windows-2025), build-and-test (ubuntu-26.0` | pass |
| C24 | `run ci-macos / job build-and-test (macos-26) conclusion: success` | pass |
| C24 | `run ci-macos / artifact: corpus-report-macOS` | pass |
| C24 | `run ci-windows / artifact: corpus-report-Windows` | pass |
| C24 | `run ci-linux / artifact: corpus-report-Linux` | pass |
| C25 | `python3 .specs/features/multi-platform-support/proofs/docs.py changelog` | pass |
| C26 | `python3 .specs/features/multi-platform-support/proofs/docs.py readme` | pass |
| C27 | `python3 .specs/features/multi-platform-support/proofs/docs.py troubleshooting` | pass |
| C27 | `python3 .specs/features/multi-platform-support/proofs/docs.py limitations` | pass |
| C28 | `grep -q '^### AD-028' .specs/STATE.md && grep -q '^### AD-029' .specs/STATE.md && awk '/^### AD-004/{f=1} f &&` | pass |
| Build | `cd extension && npm run build` | pass |
| Build | `cd extension && npx tsc -p tsconfig.json --noEmit` | pass |
| Build | `cd extension && npx tsc -p tsconfig.test.json --noEmit` | pass |
| Build | `cd corpus && npx tsc --noEmit` | pass |
| Build | `cd host && ./gradlew build --console=plain` | pass |

## Output

`Run unit` - exit 0

```
 ✓ src/host.test.ts > HostManager (T17) — lifecycle state machine against a real fake-host child process > surfaces the last stderr lines from the fake host (crash reporting, P1-I AC5)
 ✓ src/host.test.ts > HostManager (T17) — lifecycle state machine against a real fake-host child process > caps the stderr ring buffer at the configured line count
 ✓ src/host.test.ts > HostManager (T17) — lifecycle state machine against a real fake-host child process > names the inflate.hostMaxHeap setting when the crash stderr shows a JVM OutOfMemoryError (T58)
 ✓ src/host.test.ts > HostManager (T17) — lifecycle state machine against a real fake-host child process > transitions starting -> crashed on a startup failure, with crash bookkeeping and backoff self-heal (HOST-04 AC1/AC2)
 ✓ src/host.test.ts > HostManager (T17) — lifecycle state machine against a real fake-host child process > records no crash and ends stopped when dispose() kills the child mid-startup (intentional-kill edge, HOST-04 AC2)
 ✓ src/host.test.ts > HostManager (T17) — lifecycle state machine against a real fake-host child process > treats a spawn error (nonexistent command) during startup the same as an exit (HOST-04 AC1)
 ✓ src/host.test.ts > buildJavaCommand > assembles -Xmx, the layoutlib system properties, and the classpath (design §5)
 ✓ src/host.test.ts > buildJavaCommand > defaults the heap to 1024m when not specified (NFR-02)

 Test Files  18 passed (18)
      Tests  288 passed | 1 skipped (289)
   Start at  02:17:45
   Duration  2.02s (transform 396ms, setup 0ms, collect 777ms, tests 2.28s, environment 527ms, prepare 842ms)

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
```

`Run ci-windows` - exit 0

```
build-and-test (windows-2025)	Post Run actions/checkout@v4	2026-11-21T05:17:24.4235046Z Adding repository directory to the temporary git global config as a safe directory
build-and-test (windows-2025)	Post Run actions/checkout@v4	2026-11-21T05:17:24.4243502Z [command]"C:\Program Files\Git\bin\git.exe" config --global --add safe.directory D:\a\inflate\inflate
build-and-test (windows-2025)	Post Run actions/checkout@v4	2026-11-21T05:17:24.4610666Z [command]"C:\Program Files\Git\bin\git.exe" config --local --name-only --get-regexp core\.sshCommand
build-and-test (windows-2025)	Post Run actions/checkout@v4	2026-11-21T05:17:24.4979558Z [command]"C:\Program Files\Git\bin\git.exe" submodule foreach --recursive "sh -c \"git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :\""
build-and-test (windows-2025)	Post Run actions/checkout@v4	2026-11-21T05:17:24.9738283Z [command]"C:\Program Files\Git\bin\git.exe" config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
build-and-test (windows-2025)	Post Run actions/checkout@v4	2026-11-21T05:17:25.0062716Z http.https://github.com/.extraheader
build-and-test (windows-2025)	Post Run actions/checkout@v4	2026-11-21T05:17:25.0112747Z [command]"C:\Program Files\Git\bin\git.exe" config --local --unset-all http.https://github.com/.extraheader
build-and-test (windows-2025)	Post Run actions/checkout@v4	2026-11-21T05:17:25.0467393Z [command]"C:\Program Files\Git\bin\git.exe" submodule foreach --recursive "sh -c \"git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :\""
build-and-test (windows-2025)	Post Run actions/checkout@v4	2026-11-21T05:17:25.5207112Z [command]"C:\Program Files\Git\bin\git.exe" config --local --name-only --get-regexp ^includeIf\.gitdir:
build-and-test (windows-2025)	Post Run actions/checkout@v4	2026-11-21T05:17:25.5575375Z [command]"C:\Program Files\Git\bin\git.exe" submodule foreach --recursive "git config --local --show-origin --name-only --get-regexp remote.origin.url"
build-and-test (windows-2025)	Complete job	﻿2026-11-21T05:17:26.0604794Z Cleaning up orphan processes
build-and-test (windows-2025)	Complete job	2026-11-21T05:17:26.0855031Z Terminate orphan process: pid (8996) (java)
build-and-test (windows-2025)	Complete job	2026-11-21T05:17:26.1001108Z Terminate orphan process: pid (8800) (java)
build-and-test (windows-2025)	Complete job	2026-11-21T05:17:26.1089086Z Terminate orphan process: pid (8380) (conhost)
build-and-test (windows-2025)	Complete job	2026-11-21T05:17:26.1480351Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/cache/restore@v4, actions/cache/save@v4, actions/checkout@v4, actions/setup-java@v4, actions/setup-node@v4, actions/upload-artifact@v4. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
```

`Run corpus-unit` - exit 0

```
 ✓ lineEndings.test.ts > line-endings/crlf fixture > ends every line with CRLF
 ✓ lineEndings.test.ts > line-endings/crlf fixture > holds the gradle/main layout apart from line endings
 ✓ run.test.ts > comparePngs > reports goldenMissing (not a failure) when no golden exists yet
 ✓ run.test.ts > comparePngs > passes on pixel-identical images (diffRatio 0)
 ✓ run.test.ts > comparePngs > fails immediately on a width/height mismatch, regardless of tolerance
 ✓ run.test.ts > comparePngs > passes when the differing-pixel ratio is within maxDiffRatio (AA tolerance)
 ✓ run.test.ts > comparePngs > fails when the differing-pixel ratio exceeds maxDiffRatio (real regression)
 ✓ run.test.ts > updateGolden > copies the actual PNG bytes to the golden path, creating parent dirs
 ✓ run.test.ts > updateGolden > a subsequent comparePngs against the just-updated golden passes (round trip)
 ✓ run.test.ts > renderHtmlReport > summarises pass/fail counts and marks each row PASS/FAIL/ERROR correctly

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Start at  02:17:57
   Duration  244ms (transform 103ms, setup 0ms, collect 118ms, tests 14ms, environment 0ms, prepare 85ms)
```

`Run ci-macos` - exit 0

```
build-and-test (macos-26)	Post Run actions/checkout@v4	2026-11-21T05:15:29.8216060Z Adding repository directory to the temporary git global config as a safe directory
build-and-test (macos-26)	Post Run actions/checkout@v4	2026-11-21T05:15:29.8217830Z [command]/opt/homebrew/bin/git config --global --add safe.directory /Users/runner/work/inflate/inflate
build-and-test (macos-26)	Post Run actions/checkout@v4	2026-11-21T05:15:29.8290670Z [command]/opt/homebrew/bin/git config --local --name-only --get-regexp core\.sshCommand
build-and-test (macos-26)	Post Run actions/checkout@v4	2026-11-21T05:15:29.8372490Z [command]/opt/homebrew/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
build-and-test (macos-26)	Post Run actions/checkout@v4	2026-11-21T05:15:29.9449070Z [command]/opt/homebrew/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
build-and-test (macos-26)	Post Run actions/checkout@v4	2026-11-21T05:15:29.9507050Z http.https://github.com/.extraheader
build-and-test (macos-26)	Post Run actions/checkout@v4	2026-11-21T05:15:29.9514410Z [command]/opt/homebrew/bin/git config --local --unset-all http.https://github.com/.extraheader
build-and-test (macos-26)	Post Run actions/checkout@v4	2026-11-21T05:15:29.9591260Z [command]/opt/homebrew/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
build-and-test (macos-26)	Post Run actions/checkout@v4	2026-11-21T05:15:30.0451200Z [command]/opt/homebrew/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
build-and-test (macos-26)	Post Run actions/checkout@v4	2026-11-21T05:15:30.0515380Z [command]/opt/homebrew/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
build-and-test (macos-26)	Complete job	﻿2026-11-21T05:15:30.2267170Z Cleaning up orphan processes
build-and-test (macos-26)	Complete job	2026-11-21T05:15:31.4116420Z Terminate orphan process: pid (5660) (java)
build-and-test (macos-26)	Complete job	2026-11-21T05:15:33.2325460Z Terminate orphan process: pid (4117) (java)
build-and-test (macos-26)	Complete job	2026-11-21T05:15:33.6151600Z Terminate orphan process: pid (3078) (java)
build-and-test (macos-26)	Complete job	2026-11-21T05:15:33.8996440Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/cache/restore@v4, actions/cache/save@v4, actions/checkout@v4, actions/setup-java@v4, actions/setup-node@v4, actions/upload-artifact@v4. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
```

`Run ci-linux` - exit 0

```
build-and-test (ubuntu-26.04)	Post Run actions/checkout@v4	2026-11-21T05:15:15.3488316Z Adding repository directory to the temporary git global config as a safe directory
build-and-test (ubuntu-26.04)	Post Run actions/checkout@v4	2026-11-21T05:15:15.3494749Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/inflate/inflate
build-and-test (ubuntu-26.04)	Post Run actions/checkout@v4	2026-11-21T05:15:15.3559265Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
build-and-test (ubuntu-26.04)	Post Run actions/checkout@v4	2026-11-21T05:15:15.3612352Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
build-and-test (ubuntu-26.04)	Post Run actions/checkout@v4	2026-11-21T05:15:15.4049636Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
build-and-test (ubuntu-26.04)	Post Run actions/checkout@v4	2026-11-21T05:15:15.4087756Z http.https://github.com/.extraheader
build-and-test (ubuntu-26.04)	Post Run actions/checkout@v4	2026-11-21T05:15:15.4105069Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
build-and-test (ubuntu-26.04)	Post Run actions/checkout@v4	2026-11-21T05:15:15.4152450Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
build-and-test (ubuntu-26.04)	Post Run actions/checkout@v4	2026-11-21T05:15:15.4528214Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
build-and-test (ubuntu-26.04)	Post Run actions/checkout@v4	2026-11-21T05:15:15.4575696Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
build-and-test (ubuntu-26.04)	Complete job	﻿2026-11-21T05:15:15.5047897Z Cleaning up orphan processes
build-and-test (ubuntu-26.04)	Complete job	2026-11-21T05:15:15.5396720Z Terminate orphan process: pid (3488) (java)
build-and-test (ubuntu-26.04)	Complete job	2026-11-21T05:15:15.5518645Z Terminate orphan process: pid (3721) (java)
build-and-test (ubuntu-26.04)	Complete job	2026-11-21T05:15:15.5540863Z Terminate orphan process: pid (6979) (java)
build-and-test (ubuntu-26.04)	Complete job	2026-11-21T05:15:15.5633120Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/cache/restore@v4, actions/cache/save@v4, actions/checkout@v4, actions/setup-java@v4, actions/setup-node@v4, actions/upload-artifact@v4. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
```

`Run integration` - exit 0

```
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts { name: 'Error' }
[main 2026-11-21T05:19:42.052Z] AgentHostStarter: cannot create window connection: Agent Host process manager is shutting down.
```

`cd host && ./gradlew generateEngineManifest --console=plain && git diff --exit-code -- ../extension/engine-man` - exit 0

```
> Task :checkKotlinGradlePluginConfigurationErrors SKIPPED
> Task :compileKotlin UP-TO-DATE
> Task :compileJava NO-SOURCE
> Task :processResources NO-SOURCE
> Task :classes UP-TO-DATE
> Task :resolveEngineManifestArtifacts UP-TO-DATE

> Task :generateEngineManifest
Wrote engine manifest with 65 artifacts to /Users/ionixjunior/Projects/open-source/Inflate/extension/engine-manifest.json

BUILD SUCCESSFUL in 1s
3 actionable tasks: 1 executed, 2 up-to-date
```

`cd host && ./gradlew test --console=plain --tests 'engine.EngineArtifactsTest.os_name on Windows and Linux map` - exit 0

```
> Task :checkKotlinGradlePluginConfigurationErrors SKIPPED
> Task :compileKotlin UP-TO-DATE
> Task :compileJava NO-SOURCE
> Task :processResources NO-SOURCE
> Task :classes UP-TO-DATE
> Task :jar
> Task :compileTestKotlin UP-TO-DATE
> Task :compileTestJava NO-SOURCE
> Task :processTestResources NO-SOURCE
> Task :testClasses UP-TO-DATE
> Task :test

BUILD SUCCESSFUL in 823ms
4 actionable tasks: 2 executed, 2 up-to-date
```

`cd host && ./gradlew test --console=plain --tests 'engine.EngineArtifactsTest.os_arch on macOS maps to the mac` - exit 0

```
> Task :checkKotlinGradlePluginConfigurationErrors SKIPPED
> Task :compileKotlin UP-TO-DATE
> Task :compileJava NO-SOURCE
> Task :processResources NO-SOURCE
> Task :classes UP-TO-DATE
> Task :jar UP-TO-DATE
> Task :compileTestKotlin UP-TO-DATE
> Task :compileTestJava NO-SOURCE
> Task :processTestResources NO-SOURCE
> Task :testClasses UP-TO-DATE
> Task :test

BUILD SUCCESSFUL in 702ms
4 actionable tasks: 1 executed, 3 up-to-date
```

`npm run package > /dev/null 2>&1 && unzip -l extension/host.jar / grep -q ' com/sun/jna/platform/win32/' && [ ` - exit 0

```
(no output)
```

`test "$(grep -c 'android:fontFamily="@font/dancing_script"' fixtures/galleries/fonts/res/layout/custom_fonts.x` - exit 0

```
fixtures/galleries/fonts/golden/fonts-custom__default.png
```

`test "$(grep -c "key: engine-cache-\${{ runner.os }}-\${{ hashFiles('extension/engine-manifest.json') }}" .git` - exit 0

```
(no output)
```

`test "$(grep -c 'runs-on:' .github/workflows/ci.yml)" = 1 && grep -q 'runner: \[macos-26, windows-2025, ubuntu` - exit 0

```
(no output)
```

`python3 .specs/features/multi-platform-support/proofs/docs.py changelog` - exit 0

```
ok changelog: extension/CHANGELOG.md opens with the ## 1.1.0 section of criterion 25
```

`python3 .specs/features/multi-platform-support/proofs/docs.py readme` - exit 0

```
ok readme: both READMEs state the platforms and name both Command Palette shortcuts
```

`python3 .specs/features/multi-platform-support/proofs/docs.py troubleshooting` - exit 0

```
ok troubleshooting: the JDK search order of macOS, Windows and Linux is listed in order
```

`python3 .specs/features/multi-platform-support/proofs/docs.py limitations` - exit 0

```
ok limitations: the v1 bullet is gone and the Arm limitation is listed
```

`grep -q '^### AD-028' .specs/STATE.md && grep -q '^### AD-029' .specs/STATE.md && awk '/^### AD-004/{f=1} f &&` - exit 0

```
(no output)
```
