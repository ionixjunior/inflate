# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — When a component exists with its own passing unit test but is never called from the live request path, treat the AC as uncovered: add an end-to-end test that drives the real RPC/render path, not just the isolated unit.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `host/render;wiring` · harmful: 0
- features: android-xml-preview
- evidence: host/src/main/kotlin/render/LayoutRenderer.kt (Degradation never called) (host/render;wiring)
- last seen: 2026-07-20T02:05:13Z

### L-002 — Regex-based XML transforms must mask or skip <!-- comment --> spans first; add a test that tag-like text inside a comment stays inert, or comments get corrupted.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `host/preprocess;xml` · harmful: 0
- features: android-xml-preview
- evidence: host/src/main/kotlin/preprocess/Structural.kt (regex passes rewrite comment content) (host/preprocess;xml)
- last seen: 2026-07-20T02:05:13Z

### L-003 — Case-insensitive matching must hold on BOTH sides of a boundary: if discovery is case-insensitive but resolution is case-sensitive, files are accepted then fail to render — test the capital-cased variant end-to-end.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `resource-resolution;ecosystem` · harmful: 0
- features: android-xml-preview
- evidence: P1-G AC1 (Resources/Layout capital casing) — host resolution case-sensitive (resource-resolution;ecosystem)
- last seen: 2026-07-20T02:05:13Z

### L-004 — Build webview resource URIs by joining onto the registered localResourceRoots Uri (asWebviewUri(Uri.joinPath(root, name))), never via Uri.file(absPath): context.globalStorageUri is vscode-userdata-scheme, so a file:-scheme resource under it 401s; and test webview resource LOADING end-to-end, not just <img> presence.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `extension/webview` · harmful: 0
- features: android-xml-preview
- evidence: extension/src/panel.ts:208 (pre-fix) (extension/webview)
- last seen: 2026-07-21T00:10:30Z

### L-005 — When a spec AC names a job's needs: list, include every upstream job whose output the job reads (not just the 'primary' dependency) — e.g. a reporting job needs both the gate job AND the accept job if it reads accept's captured head_sha output.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `.specs/features/*/spec.md` · harmful: 0
- features: android-xml-preview
- evidence: REL-06 AC3 (.specs/features/*/spec.md)
- last seen: 2026-07-27T22:32:38Z

### L-006 — A pure webview-ui state module (e.g. a vscode.setState/getState cache) having its own isolated unit tests does not prove the live entry script actually calls it at boot or on every relevant event; add a real-webview assertion that would fail if the call-site wiring were removed, not just the extracted module's unit tests.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `extension/webview-ui` · harmful: 0
- features: android-xml-preview
- evidence: extension/webview-ui/main.ts (persistState()/getState() boot wiring, DF-6 UX-06 AC4) — dropping the wiring entirely left all 224 unit + 33 integration tests green (extension/webview-ui)
- last seen: 2026-07-30T12:00:00Z

### L-007 — Do not increment a delivery/replay observability counter unconditionally in a handler; increment it only from inside the branch that actually performs the delivery, or a regression that silently skips delivery will still show the counter advancing and slip past tests that check the counter instead of the payload.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `extension/panel` · harmful: 0
- features: android-xml-preview
- evidence: extension/src/panel.ts:227-233 (ready handler replayCount, DF-6 UX-06 AC1/AC2/AC7) — gating the actual replay to first-ready-only while replayCount kept incrementing unconditionally left the dedicated RED-first-repro test green; only the unrelated AC5 config test happened to catch it (extension/panel)
- last seen: 2026-07-30T12:00:00Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
