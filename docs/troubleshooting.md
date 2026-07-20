# Troubleshooting

Start with **`Inflate: Doctor`** (Command Palette) for almost every problem below — it prints a
read-only report to the "Inflate" output channel: detected JDK, engine cache state, host process
state + PID + last crash stderr, the engine version pin, and the last render's timing breakdown.
Nothing in Doctor ever installs, downloads, or restarts anything — it only reports.

## "No compatible JDK found"

Inflate looks for a JDK in this order: `inflate.javaHome` setting → `JAVA_HOME` env var → `PATH` →
platform-standard install locations (macOS: `/usr/libexec/java_home` registry, Homebrew, SDKMAN,
Android Studio's bundled JBR, Microsoft OpenJDK install dirs). **JDK 17 or newer is required**
(the engine pin's minimum — see AD-008 in `.specs/STATE.md`).

Inflate **never downloads a JVM for you** (a deliberate choice — see AD-003): if none of the above
locations has a compatible JDK, you'll see a guided message with the minimum version and a download
link, plus a "re-check" action to retry after installing one.

**Fix:** install a JDK 17+ (Temurin, Microsoft Build of OpenJDK, or Android Studio, which bundles
one), then either let auto-detection find it or point `inflate.javaHome` directly at its home
directory, then run the guided message's "re-check" action (or just try opening a preview again).

## "Inflate needs a one-time network connection..." / the engine download fails

The first preview ever requested triggers a one-time download of the pinned engine artifacts
(layoutlib + bundled androidx/Material libraries) from Google's Maven repository (`dl.google.com`)
— about 170 MB total, shown with progress. This is the **only** network traffic Inflate ever makes.

- **Offline on first run:** the download can't complete without network access; you'll see an
  `OfflineError` naming the artifact that failed. Reconnect and retry — nothing is left half-cached
  (a failed/interrupted download never leaves a partial artifact where the host would try to load
  it; each artifact is verified against a pinned SHA-256 and only atomically moved into place once
  it passes).
- **Corporate proxy / firewall blocking `dl.google.com`:** allow that host, or (for a completely
  offline environment) pre-populate the cache out-of-band — see `extension/src/artifacts.ts`'s cache
  layout under `globalStorage/engine/<manifestHash>/` if you need to do this manually.
- **After the first successful download**, everything works fully offline — Doctor's "Engine cache"
  section reports `ready: true` and each artifact's installed state/size once cached.

**`Inflate: Clear Engine Cache`** deletes the cached artifacts entirely, forcing a fresh
download-and-verify next time a preview is opened — useful if you suspect a corrupted cache (this
should be rare given the SHA-256 verification, but the command exists as an escape hatch).

## The render host crashed / "cannot render while host state is 'crashed'"

The render host is a separate JVM process; Doctor's "Host" section shows its current state
(`stopped` / `starting` / `ready` / `rendering` / `crashed`) and PID. A crash:

1. Is auto-recovered: Inflate kills the wedged/dead process (if not already dead) and respawns it
   with exponential backoff (1s / 4s / 15s), up to **3 automatic restarts within a rolling 5-minute
   window**. The very next render request after the backoff elapses just works, with no user action
   needed.
2. Surfaces the host's last stderr lines in the preview panel and in Doctor's report, so you can see
   *why* it crashed rather than a bare "something went wrong."
3. Keeps your last good render visible (stale-marked), never replacing it with a blank/broken panel.

**If a 4th crash happens within that 5-minute window**, auto-restart stops (to avoid a crash loop
burning CPU) and Doctor's host state stays `crashed` — run **`Inflate: Restart Render Host`** to
recover manually.

### "the render host ran out of memory" / stderr mentions `OutOfMemoryError`

The crash message itself names the fix: raise **`inflate.hostMaxHeap`** (default 1024 MB) in your
settings, then restart the host (`Inflate: Restart Render Host`) or just try previewing again — a
crashed host respawns with the new heap size automatically on its next start.

### A render times out ("render timed out after Nms")

A single render exceeding **`inflate.renderTimeoutMs`** (default 15000 ms) is treated as a crash:
the host process is killed (it's the only reliable way to interrupt a wedged native render) and
respawned per the crash-recovery flow above. If you have a genuinely huge/pathological layout that
legitimately needs longer, raise `inflate.renderTimeoutMs`; if a normal-looking layout times out,
that's worth reporting (300-view+ layouts should render in well under a second — see
[docs/performance.md](performance.md)).

## "No orphan processes" — is the host still running after I close VS Code?

It shouldn't be: the host process is terminated (graceful SIGTERM, 3-second grace period, then
SIGKILL) whenever the extension deactivates — window close, workspace close, or VS Code quitting.
If you ever find a lingering `java` process after VS Code has fully exited, that's a bug — please
report it with your OS/VS Code version.

## A specific file doesn't render / shows an unexpected error

- Check the exact error message in the preview panel and in the "Inflate" output channel — inflation
  and resource errors are mapped to the offending file/line where possible.
  See [docs/limitations.md](limitations.md) first — several rendering gaps (certain Material
  widgets, custom views, comments containing tag-like text, data-binding edge cases) are **known,
  documented divergences**, not new bugs.
- If a file references a resource root Inflate didn't discover automatically (an unconventional or
  deeply nested multi-module layout), add the directory to **`inflate.resourceRoots`**.

## Reading logs

Every extension- and host-side log line goes to the **"Inflate" output channel** (View → Output →
"Inflate"), timestamped and tagged with a render id where applicable — this is the first place to
look for anything not covered above.
