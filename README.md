# Inflate

**Faithful Android layout & drawable XML previews in VS Code — powered by layoutlib, no Android
Studio required.**

Inflate renders your real Android XML — layouts, drawables, colors, nine-patches — the same way
Android's own rendering engine (`layoutlib`) does, right inside VS Code. It works on native Gradle
Android projects **and** .NET (Xamarin/MAUI) Android projects, because it drives the same engine off
the XML/resource-tree conventions both ecosystems share, not off either build system.

- **No Android Studio.** No Android SDK. No Gradle or MSBuild invocation, ever.
- **Faithful.** Real inflation, measure, and draw via the same `layoutlib` Android Studio itself
  uses — not an approximation.
- **Both ecosystems, day one.** `res/layout/*.xml` (Gradle) and `Resources/layout/*.axml` (.NET) are
  both first-class.
- **Light/dark, device, density, orientation.** Preview any config combination from a toolbar, no
  manifest edits.

## Install

1. Install the **Inflate** extension from the VS Code Marketplace (or a `.vsix` — see
   [CONTRIBUTING.md](CONTRIBUTING.md) for building one yourself).
2. Make sure a **JDK 17 or newer** is on your machine (Android Studio's bundled JBR, Microsoft
   OpenJDK, Homebrew/SDKMAN's `openjdk`, or any standard JDK install all work). Inflate finds it
   automatically — it never downloads or bundles a JVM itself.
3. Open a workspace containing an Android layout, drawable, or color XML file.

## First run

The **first time** you preview anything, Inflate needs a one-time download of the pinned rendering
engine (layoutlib + the bundled androidx/Material libraries) from Google's Maven repository —
**about 170 MB**, shown with progress in the preview panel. This only happens once per engine
version; after that, and with the network off entirely, previews keep working (offline-first after
first run — see [docs/troubleshooting.md](docs/troubleshooting.md) if the download fails partway).

If Inflate can't find a compatible JDK, it shows a guided setup message with a download link and a
"re-check" action instead — it never tries to download or manage a JVM for you (see
[AD-003](.specs/STATE.md)).

### Quickstart

1. Open any file under `res/layout/`, `res/drawable/`, `Resources/layout/`, or `Resources/drawable/`
   (`.xml` or `.axml`).
2. Right-click → **Inflate: Open Preview** (or `Cmd+P` → **Inflate: Open Preview**).
3. Edit and save — the preview updates in place, without stealing focus from your editor.
4. Use the toolbar to flip day/night, change device/density/orientation, or (for drawables) pick a
   state (pressed, checked, disabled, …) and inspect it against the checkerboard stage — or drag
   the preview's edges to try arbitrary sizes.

## Commands

| Command | What it does |
| ------- | ------------ |
| `Inflate: Open Preview` | Opens (or reveals) the preview panel for the active/selected XML file. |
| `Inflate: Refresh Preview` | Re-renders the active preview from the editor's current (possibly unsaved) buffer. |
| `Inflate: Doctor` | Reports detected JDK, engine cache state, host status, resolved resource roots, and the last render's timings — the first thing to check when something looks wrong. |
| `Inflate: Clear Engine Cache` | Deletes the cached engine artifacts (forces a fresh download + verification next time a preview is opened). |
| `Inflate: Restart Render Host` | Manually restarts the render host process (needed after 4 crashes in 5 minutes trips the auto-restart limit — see [docs/troubleshooting.md](docs/troubleshooting.md)). |

## Settings

| Setting | Default | What it controls |
| ------- | ------- | ----------------- |
| `inflate.javaHome` | _(unset)_ | Absolute path to a JDK install, overriding auto-detection (`JAVA_HOME` > `PATH` > platform-standard locations). |
| `inflate.resourceRoots` | `[]` | Extra resource-root directories to merge in, for project layouts the automatic module/source-set discovery doesn't find (multi-module or unconventional layouts). |
| `inflate.hostMaxHeap` | `1024` (MB) | The render host JVM's `-Xmx`. Raise this if Doctor or a crash message reports an `OutOfMemoryError`. |
| `inflate.renderTimeoutMs` | `15000` | How long a single render may run before Inflate kills and restarts the host, treating it as a crash. |

## What's rendered faithfully, and what isn't (yet)

Inflate aims to be complete for v1 across framework views/widgets, the bundled androidx/Material
surface, and every drawable type — but it is not 100% pixel-identical to Android Studio in every
case. **Read [docs/limitations.md](docs/limitations.md) before relying on a pixel-perfect render** —
it documents every known divergence (a handful of Material widgets, custom views, data binding,
version pinning) plainly, with no overstatement.

## Documentation

- [docs/troubleshooting.md](docs/troubleshooting.md) — no JDK found, offline/download failures, host
  crashes, and what `Inflate: Doctor` tells you about each.
- [docs/limitations.md](docs/limitations.md) — every known fidelity gap and why it exists.
- [docs/material-quirks.md](docs/material-quirks.md) — the detailed Material-widget-by-widget
  rendering catalog referenced from limitations.
- [docs/performance.md](docs/performance.md) — measured render latency against the product's targets.
- [CONTRIBUTING.md](CONTRIBUTING.md) — repo layout, building from source, running the gates, the
  golden-image corpus.

## Privacy

No telemetry. The only network traffic Inflate ever makes is the one-time pinned engine download
from `dl.google.com` (Google's own Maven repository), verified against pinned SHA-256 checksums.
Your project files never leave your machine — the render host runs with no project bytecode loaded.

## License

Apache-2.0 — see [LICENSE](LICENSE).
