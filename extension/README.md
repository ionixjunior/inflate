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
- **Both ecosystems, day one.** `res/layout/*.xml` (Gradle) and `Resources/layout/*.axml` (.NET)
  are both first-class.
- **Light/dark, device, density, orientation.** Preview any configuration combination from the
  toolbar — no manifest edits. Drag the preview's edges to try arbitrary sizes.
- **Drawable states.** Inspect selectors in any state (pressed, checked, disabled, …) against a
  checkerboard stage.

## Requirements

- **macOS** (v1 is macOS-only; Apple Silicon is the primary tested platform, Intel Macs are
  supported best-effort).
- **VS Code 1.90+**.
- **A JDK 17 or newer** on your machine (Android Studio's bundled JBR, Microsoft OpenJDK,
  Homebrew/SDKMAN `openjdk`, or any standard JDK install all work). Inflate finds it automatically —
  it never downloads or manages a JVM itself. If none is found, a guided setup message walks you
  through it.

## First run

The **first time** you preview anything, Inflate makes a one-time download of the pinned rendering
engine (layoutlib + the bundled androidx/Material libraries) from Google's Maven repository —
**about 170 MB**, shown with progress in the preview panel. This happens once per engine version;
after that previews keep working fully offline.

## Quickstart

1. Open any file under `res/layout/`, `res/drawable/`, `Resources/layout/`, or
   `Resources/drawable/` (`.xml` or `.axml`).
2. Click the preview icon in the editor title bar (or right-click → **Inflate: Open Preview**).
3. Edit and save — the preview updates in place, without stealing focus from your editor.
4. Use the toolbar to flip day/night, change device/density/orientation, pick a drawable state —
   or drag the preview's edges to resize the render canvas.

## Commands

| Command | What it does |
| ------- | ------------ |
| `Inflate: Open Preview` | Opens (or reveals) the preview panel for the active/selected XML file. |
| `Inflate: Refresh Preview` | Re-renders the active preview from the editor's current (possibly unsaved) buffer. |
| `Inflate: Doctor` | Reports detected JDK, engine cache state, host status, resolved resource roots, and the last render's timings — the first thing to check when something looks wrong. |
| `Inflate: Clear Engine Cache` | Deletes the cached engine artifacts (forces a fresh download + verification next time a preview is opened). |
| `Inflate: Restart Render Host` | Manually restarts the render host process (needed after repeated crashes trip the auto-restart limit). |

## Settings

| Setting | Default | What it controls |
| ------- | ------- | ---------------- |
| `inflate.javaHome` | _(unset)_ | Absolute path to a JDK install, overriding auto-detection (`JAVA_HOME` > `PATH` > platform-standard locations). |
| `inflate.resourceRoots` | `[]` | Extra resource-root directories to merge in, for project layouts the automatic module/source-set discovery doesn't find (multi-module or unconventional layouts). |
| `inflate.hostMaxHeap` | `1024` (MB) | The render host JVM's `-Xmx`. Raise this if Doctor or a crash message reports an `OutOfMemoryError`. |
| `inflate.renderTimeoutMs` | `15000` | How long a single render may run before Inflate kills and restarts the host, treating it as a crash. |

## What's rendered faithfully, and what isn't (yet)

Inflate aims to be complete across framework views/widgets, the bundled androidx/Material surface,
and every drawable type — but it is not 100% pixel-identical to Android Studio in every case. Read
[docs/limitations.md](https://github.com/ionixjunior/inflate/blob/main/docs/limitations.md) before
relying on a pixel-perfect render — it documents every known divergence (a handful of Material
widgets, custom views, data binding, version pinning) plainly.

## Troubleshooting

Run **`Inflate: Doctor`** first — it reports the detected JDK, engine cache, host status, and last
render timings. Then see
[docs/troubleshooting.md](https://github.com/ionixjunior/inflate/blob/main/docs/troubleshooting.md)
for no-JDK, offline/download-failure, and host-crash walkthroughs.

## Privacy

No telemetry. The only network traffic Inflate ever makes is the one-time pinned engine download
from `dl.google.com` (Google's own Maven repository), verified against pinned SHA-256 checksums.
Your project files never leave your machine — the render host runs with no project bytecode loaded.

## Contributing & license

Source, issues, and contribution guide live at
[github.com/ionixjunior/inflate](https://github.com/ionixjunior/inflate) —
bugs and feature requests go to the
[issue tracker](https://github.com/ionixjunior/inflate/issues).

Licensed under the
[Apache License 2.0](https://github.com/ionixjunior/inflate/blob/main/LICENSE).
