/**
 * Webview entry script (T37, design component #9). Owns the live preview DOM: it listens for
 * extension → webview messages, reduces them via the pure {@link reduce} view model, and paints the
 * result (image, stale dimming, error panel, collapsible warnings strip, file-gone state). Bundled
 * by esbuild to `dist/webview.js`; the DOM wiring here is exercised by the integration test, while
 * the reduction logic is unit-tested in `panel.test.ts`.
 */

import {
  PanelViewModel,
  WebviewMessage,
  initialViewModel,
  reduce,
  toggleWarnings,
  warningCountsByKind,
} from './viewmodel';

// Provided by the VS Code webview runtime.
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();
let state: PanelViewModel = initialViewModel;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function paint(): void {
  const img = $('preview') as HTMLImageElement | null;
  if (img) {
    if (state.imageUri) {
      img.src = state.imageUri;
      img.style.display = '';
      img.style.opacity = state.stale ? '0.4' : '1';
    } else {
      img.style.display = 'none';
    }
  }

  const stale = $('staleChip');
  if (stale) stale.style.display = state.stale ? '' : 'none';

  const errorPanel = $('errorPanel');
  if (errorPanel) {
    if (state.error) {
      const loc = state.error.line ? ` (line ${state.error.line}${state.error.column ? ':' + state.error.column : ''})` : '';
      errorPanel.textContent = state.error.message + loc;
      errorPanel.style.display = '';
    } else {
      errorPanel.style.display = 'none';
    }
  }

  const fileGone = $('fileGone');
  if (fileGone) fileGone.style.display = state.fileGone ? '' : 'none';

  const warnings = $('warnings');
  const warningsHeader = $('warningsHeader');
  const warningsList = $('warningsList');
  if (warnings && warningsHeader && warningsList) {
    if (state.warnings.length === 0) {
      warnings.style.display = 'none';
    } else {
      warnings.style.display = '';
      const counts = warningCountsByKind(state.warnings);
      warningsHeader.textContent =
        Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') +
        (state.warningsCollapsed ? ' ▸' : ' ▾');
      warningsList.style.display = state.warningsCollapsed ? 'none' : '';
      warningsList.innerHTML = '';
      for (const w of state.warnings) {
        const li = document.createElement('li');
        li.textContent = `[${w.kind}] ${w.message}`;
        warningsList.appendChild(li);
      }
    }
  }

  const status = $('status');
  if (status) {
    status.textContent = state.status ?? '';
    status.style.display = state.status ? '' : 'none';
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  state = reduce(state, event.data as WebviewMessage);
  paint();
});

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target && target.id === 'warningsHeader') {
    state = toggleWarnings(state);
    paint();
  }
  if (target && target.id === 'refreshButton') {
    vscode.postMessage({ type: 'refresh' });
  }
});

// Signal readiness so the extension can flush any queued state.
vscode.postMessage({ type: 'ready' });
paint();
