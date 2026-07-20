# Contributing to Inflate

## Repo layout (AD-012)

```
extension/       TypeScript VS Code extension (incl. webview-ui/) — the user-facing side
host/            Kotlin JVM render host (Gradle, dev-time build only — never invoked on a user's machine)
corpus/          Golden-image corpus runner + performance harness (Node/TS, standalone package)
fixtures/        Golden corpus fixtures: gradle-sample, dotnet-sample/dotnet-gallery, galleries, goldens
docs/            protocol.md (the extension<->host contract), limitations, troubleshooting, performance
shared/          Cross-language shared fixtures/config (e.g. eligibility.json)
.specs/          Spec-driven development artifacts: spec, design, tasks, decision log (STATE.md)
.github/         CI workflows
```

Gradle/MSBuild are **forbidden at user runtime** (AD-001) — the product never invokes either. Gradle
is used here only as *our own* dev-time build tool for `host/`; this distinction matters when reading
the code (e.g. `host/build.gradle.kts` is never shipped or run on an end user's machine).

## Prerequisites

- **JDK 17+** (for building/testing `host/`)
- **Node 20+** (for `extension/` and `corpus/`)
- macOS (arm64 or x64) — v1's only supported development/target platform (AD-004)

## Building from source

```sh
# Host (Kotlin JVM render host)
cd host
./gradlew fetchEngine     # one-time: downloads ~170 MB of pinned layoutlib/androidx artifacts
                          # into host/.engine-cache/ (gitignored) — required before engineTest
./gradlew build test      # unit tests only, no engine cache needed
./gradlew engineTest      # integration tests against the real engine (needs fetchEngine above)

# Extension
cd extension
npm ci
npm run build
npm test                  # unit tests (Vitest)
npm run test:integration  # @vscode/test-electron integration tests (spawns a real VS Code instance)

# Golden-image corpus + performance harness
cd corpus
npm ci
npm run corpus            # unit tests + real render host spawn + pixel-diff against checked-in goldens
npm run perf               # measures p90 latency against NFR-01 targets (docs/performance.md)
```

Or, from the repo root: `npm run corpus` (installs `corpus/`'s dependencies and runs the same gate).

## Gates (what must pass before a change is considered done)

| Gate level | Command |
| ---------- | ------- |
| Extension unit | `cd extension && npm test` |
| Extension integration | `cd extension && npm run test:integration` |
| Host unit | `cd host && ./gradlew test` |
| Host engine integration | `cd host && ./gradlew engineTest` (needs `./gradlew fetchEngine` once) |
| Golden-image corpus | `npm run corpus` (repo root) or `cd corpus && npm run corpus` |
| Full pipeline (what CI runs) | all of the above, in the order listed |

CI (`.github/workflows/ci.yml`) runs the full pipeline on macOS arm64 on every push/PR, plus a
lighter unit-test-only smoke on macOS Intel. A daily canary (`.github/workflows/canary.yml`) fetches
the pinned engine artifacts from a cold cache to catch a broken/moved Google Maven artifact quickly.

## The golden-image corpus

`corpus/manifest.json` lists every fixture x config combination rendered and diffed on every run.
It spans both ecosystems (Gradle `res/` and .NET `Resources/`), framework + androidx/Material
widgets, and every drawable type, with night/density/orientation variants on several fixtures
(NFR-07). Goldens live alongside their fixtures under `fixtures/**/golden/*.png`.

- **Adding a fixture**: add the XML under `fixtures/`, add an entry to `corpus/manifest.json`, then
  run `cd corpus && npm run render:update` to generate its golden — review the generated PNG before
  committing it (a golden is only as good as the review that approved it).
- **A visual regression**: `npm run corpus` fails with a non-zero exit and writes
  `corpus/report.html` (a side-by-side actual/golden/diff view) — open it to see exactly what
  changed. If the change is intentional (e.g. an engine pin bump), regenerate the affected goldens
  with `--update-goldens` and review the diff report before committing.

## Protocol changes

`docs/protocol.md` is the single authoritative source for the extension⇄host JSON-RPC contract.
Both sides' DTOs (`extension/src/protocol.ts` and `host/src/main/kotlin/rpc/Dto.kt`) must be updated
together and validated against the shared fixtures under `docs/protocol/fixtures/`. Never change one
side without the other.

## Commit / PR conventions

This repo follows the spec-driven workflow recorded in `.specs/` — see `.specs/STATE.md` for the
decision log (`AD-NNN` entries) and current execution state. One atomic, verb-first commit per
logical change; tests are derived from the spec's acceptance criteria, not from the implementation.

## Reporting a rendering discrepancy

Check [docs/limitations.md](docs/limitations.md) first — several divergences from Android Studio are
known and documented. If what you're seeing isn't listed there, please include: the XML file (or a
minimal repro), the theme/config used, a screenshot, and `Inflate: Doctor`'s output.
