# Changelog

Notable changes to the Inflate extension. Per-release notes (with merged PRs) are also published on
the [GitHub Releases page](https://github.com/ionixjunior/inflate/releases).

## 1.0.3

Bug fixes — no new capability.

- Fixed: XML files saved with a UTF-8 byte-order mark (BOM) — common in legacy Windows/Xamarin-
  authored projects — failed to preview with a misleading `PI must not start with xml` error. Such
  files now preview correctly; a genuine syntax error in a BOM'd file now points at its real line
  instead.

## 1.0.2

Bug fixes — no new capability.

- Fixed: layout previews now respect the root element's own `layout_width`/`layout_height`,
  margins, and `layout_gravity` instead of always stretching over the entire device canvas. A
  `wrap_content` card now renders at its true size inside the device frame, exactly as Android
  Studio shows it; children constrained to the parent's bottom no longer float at mid-screen.

## 1.0.1

Bug fixes — no new capability.

- Fixed: the very first preview could hang permanently if a render was triggered (e.g. an
  auto-save) while the one-time engine download was still running. The render host now recovers
  automatically instead of getting stuck; the same preview completes once the download finishes.
- Fixed: `Inflate: Doctor` no longer lists code-only androidx libraries (which ship no resources)
  as "missing" once the engine is installed.

## 1.0.0

Initial public release.

- Faithful layout & drawable XML rendering via Android's own `layoutlib` — no Android Studio, no
  Android SDK, no Gradle/MSBuild invocation.
- Gradle (`res/…/*.xml`) and .NET Xamarin/MAUI (`Resources/…/*.axml`) projects both supported,
  including legacy lowercase resource-folder casing.
- Preview toolbar: day/night theme, device presets, density, orientation, drawable state picker;
  drag-to-resize on the preview edges; fit-to-window and wheel zoom with pan.
- Live updates on save (and on dependency saves) without stealing editor focus; manual refresh
  renders the unsaved buffer.
- One-time pinned engine download (~170 MB from Google Maven, SHA-256-verified), fully offline
  afterwards; `Inflate: Clear Engine Cache` forces a re-fetch.
- Crash-resilient render host with auto-restart limits, `Inflate: Restart Render Host`, and
  `Inflate: Doctor` diagnostics (JDK detection, cache state, resource roots, render timings).
- No telemetry.

Platform: macOS (Apple Silicon primary; Intel best-effort). Requires VS Code 1.90+ and a JDK 17+.
