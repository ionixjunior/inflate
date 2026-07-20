/**
 * Pure webview state logic (T37, design component #9). The webview receives extension → webview
 * messages and reduces them into a {@link PanelViewModel}; `main.ts` applies that model to the DOM.
 * Keeping the reducer DOM-free makes the message contract (setImage / setError / setStatus /
 * fileGone), stale-render dimming, and warnings collapse unit-testable under vitest without jsdom.
 */

export interface WarningVM {
  kind: string;
  message: string;
}

/** Drawable metadata a render response carries for the toolbar (T49). */
export interface DrawableMetaVM {
  stateSensitive: boolean;
  staticPreviewBadge: boolean;
  matched?: { index: number; stateAttrs: string[] };
}

export type WebviewMessage =
  | {
      type: 'setImage';
      uri: string;
      width: number;
      height: number;
      warnings: WarningVM[];
      canvasCapped?: boolean;
      drawable?: DrawableMetaVM;
    }
  | { type: 'setError'; message: string; file?: string; line?: number; column?: number; warnings: WarningVM[] }
  | { type: 'setStatus'; status: string }
  | { type: 'fileGone' };

export interface PanelViewModel {
  imageUri?: string;
  imageWidth?: number;
  imageHeight?: number;
  /** The displayed image is a previous (last-good) render kept while the newest attempt failed. */
  stale: boolean;
  error?: { message: string; file?: string; line?: number; column?: number };
  status?: string;
  fileGone: boolean;
  warnings: WarningVM[];
  warningsCollapsed: boolean;
  /** Drawable metadata from the latest successful render (toolbar picker/badge/matched display). */
  drawable?: DrawableMetaVM;
  /** True when the last render hit the 4096 px canvas cap (T52, UX-03) — stops zoom escalation. */
  canvasCapped: boolean;
}

export const initialViewModel: PanelViewModel = {
  stale: false,
  fileGone: false,
  warnings: [],
  warningsCollapsed: true,
  canvasCapped: false,
};

/** Reduce one message into the next view model (pure). */
export function reduce(state: PanelViewModel, msg: WebviewMessage): PanelViewModel {
  switch (msg.type) {
    case 'setImage':
      // A fresh successful render clears any error/stale/file-gone state.
      return {
        ...state,
        imageUri: msg.uri,
        imageWidth: msg.width,
        imageHeight: msg.height,
        stale: false,
        error: undefined,
        fileGone: false,
        status: undefined,
        warnings: msg.warnings,
        drawable: msg.drawable,
        canvasCapped: msg.canvasCapped ?? false,
      };
    case 'setError':
      // Keep the last good image (dimmed + stale) if one exists; show the error either way (UX-04).
      return {
        ...state,
        error: { message: msg.message, file: msg.file, line: msg.line, column: msg.column },
        stale: state.imageUri !== undefined,
        fileGone: false,
        status: undefined,
        warnings: msg.warnings,
      };
    case 'setStatus':
      return { ...state, status: msg.status };
    case 'fileGone':
      return { ...state, fileGone: true, stale: state.imageUri !== undefined };
    default:
      return state;
  }
}

/** Toggle the collapsible warnings strip. */
export function toggleWarnings(state: PanelViewModel): PanelViewModel {
  return { ...state, warningsCollapsed: !state.warningsCollapsed };
}

/** Warning counts grouped by kind, for the strip header (e.g. "2 unresolved refs, 1 notice"). */
export function warningCountsByKind(warnings: WarningVM[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const w of warnings) counts[w.kind] = (counts[w.kind] ?? 0) + 1;
  return counts;
}
