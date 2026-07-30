/**
 * Webview-side transient cache (T101, DF-6, UX-06 AC4). `vscode.setState`/`getState` is the only
 * storage that survives a hidden webview's context being destroyed and recreated
 * (`retainContextWhenHidden: false`) — plain module variables reset to their initial values on every
 * reload, since the script re-executes from scratch. Caching the last applied image plus the
 * viewport's zoom/pan here lets `main.ts` repaint instantly at boot, before the extension's replay
 * (T99) round-trips back — killing the blank flash on tab reveal. The replay is still authoritative:
 * a same-URI re-apply is idempotent, and a newer result simply supersedes whatever was cached.
 *
 * Kept DOM- and vscode-API-free (no `acquireVsCodeApi()` call here) so it's unit-testable under
 * vitest with no jsdom, mirroring `viewmodel.ts`/`viewport.ts`/`toolbar.ts` — `main.ts` owns the
 * actual `setState`/`getState` I/O and calls these pure functions around it.
 */

import type { PanelViewModel } from './viewmodel';
import type { PanOffset, ZoomState } from './viewport';

/** Which of the mutually-exclusive result states was cached, alongside `imageUri` — lets `restore`
 * decide whether a cached image should paint dimmed (a stale render under an error/file-gone
 * notice, mirroring `paint()`'s existing opacity rule) or at full opacity. */
export type CachedResultKind = 'image' | 'error' | 'fileGone' | 'none';

export interface CachedPanelState {
  imageUri?: string;
  width: number;
  height: number;
  resultKind: CachedResultKind;
  zoom: ZoomState;
  panX: number;
  panY: number;
}

function resultKindOf(viewModel: PanelViewModel): CachedResultKind {
  if (viewModel.fileGone) return 'fileGone';
  if (viewModel.error) return 'error';
  if (viewModel.imageUri) return 'image';
  return 'none';
}

/** Snapshot the current view model + viewport into the cacheable shape. */
export function captureState(viewModel: PanelViewModel, zoom: ZoomState, pan: PanOffset): CachedPanelState {
  return {
    imageUri: viewModel.imageUri,
    width: viewModel.imageWidth ?? 0,
    height: viewModel.imageHeight ?? 0,
    resultKind: resultKindOf(viewModel),
    zoom,
    panX: pan.x,
    panY: pan.y,
  };
}

/** What `main.ts` should apply at boot from a cached snapshot: a partial view model (only the image-
 * related fields a cache can meaningfully restore — omitted entirely when there's nothing to show)
 * plus the exact zoom/pan state (restored unconditionally — the viewport's transients are independent
 * of whether a result was cached). */
export interface RestoredPanelState {
  viewModel?: Pick<PanelViewModel, 'imageUri' | 'imageWidth' | 'imageHeight' | 'stale' | 'fileGone'>;
  zoom: ZoomState;
  pan: PanOffset;
}

/** Rehydrate a cached snapshot (pure — `main.ts` assigns the result onto its module state). */
export function restoreState(cached: CachedPanelState): RestoredPanelState {
  const pan: PanOffset = { x: cached.panX, y: cached.panY };
  if (cached.resultKind === 'none' || !cached.imageUri) {
    return { zoom: cached.zoom, pan };
  }
  return {
    zoom: cached.zoom,
    pan,
    viewModel: {
      imageUri: cached.imageUri,
      imageWidth: cached.width,
      imageHeight: cached.height,
      stale: cached.resultKind === 'error',
      fileGone: cached.resultKind === 'fileGone',
    },
  };
}
