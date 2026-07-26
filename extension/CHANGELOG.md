# Changelog

Notable changes to the Inflate extension. Per-release notes (with merged PRs) are also published on
the [GitHub Releases page](https://github.com/ionixjunior/inflate/releases).

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
