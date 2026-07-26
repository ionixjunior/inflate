/**
 * The fix-pack's loading-phase labels (POLISH-02) shown in the panel's busy indicator while a
 * preview is opening: "Preparing render engine…" (+ artifact/percent during a real download),
 * "Starting render host…", "Rendering…". Kept as pure, named exports (no `vscode` import) so their
 * exact text is unit-testable — `activation.ts` wires them into `panelManager.setBusy`.
 */

export const PHASE_PREPARING_ENGINE = 'Preparing render engine…';
export const PHASE_STARTING_HOST = 'Starting render host…';
export const PHASE_RENDERING = 'Rendering…';

/** The "Preparing render engine…" phase label with the artifact key + download percent appended
 * once a real download is in progress (matches `ArtifactManager.ensureInstalled`'s progress event
 * shape: an artifact key, and a percent only once `totalBytes` is known). */
export function preparingEnginePhase(artifactKey: string, percent?: number): string {
  const suffix = `${artifactKey}${percent !== undefined ? ` ${percent}%` : ''}`;
  return `${PHASE_PREPARING_ENGINE} ${suffix}`;
}
