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
import {
  DENSITIES,
  DEVICE_PRESETS,
  DRAWABLE_STATES,
  Density,
  DrawableStateName,
  ORIENTATION_OPTIONS,
  Orientation,
  ThemeOption,
  ToolbarState,
  buildConfigChanged,
  buildDensityChanged,
  buildDeviceChanged,
  buildNightChanged,
  buildOrientationChanged,
  buildThemeChanged,
  hydrateToolbarState,
  initialToolbarState,
  matchedLabel,
  orderThemesForPicker,
  pickerVisible,
} from './toolbar';
import {
  ZoomState,
  applyCanvasCapped,
  clampPan,
  initialPanOffset,
  initialZoomState,
  nextZoomState,
  resolveZoomPercent,
  shouldRequestPixelScale,
  type PanOffset,
} from './viewport';

// Provided by the VS Code webview runtime.
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();
let state: PanelViewModel = initialViewModel;
let toolbar: ToolbarState = { ...initialToolbarState };
let zoom: ZoomState = { ...initialZoomState };
let pan: PanOffset = { ...initialPanOffset };
let zoomPersistTimer: ReturnType<typeof setTimeout> | undefined;
let themeOptions: ThemeOption[] = [];

/** Recompute the effective zoom against the current stage size + image, applying the resulting
 * pixel-scale escalation (debounced persist, T52/UX-03) and CSS transform. */
function applyZoom(nextSetting: ZoomState['zoom']): void {
  const stage = $('stage');
  const rect = stage?.getBoundingClientRect();
  const percent = resolveZoomPercent(
    nextSetting,
    state.imageWidth ?? 1,
    state.imageHeight ?? 1,
    rect?.width ?? 1,
    rect?.height ?? 1,
  );
  const next = nextZoomState(zoom, nextSetting, percent);
  const requestPixelScale = shouldRequestPixelScale(zoom, next);
  zoom = next;
  pan = clampPan(pan, state.imageWidth ?? 1, state.imageHeight ?? 1, rect?.width ?? 1, rect?.height ?? 1, zoom.percent);
  paintTransform();

  clearTimeout(zoomPersistTimer);
  zoomPersistTimer = setTimeout(() => vscode.postMessage({ type: 'zoomChanged', zoom: zoom.zoom }), 250);

  if (requestPixelScale) vscode.postMessage({ type: 'configChanged', pixelScale: zoom.pixelScale });
}

/** Apply the current zoom/pan as a CSS transform on the preview image. */
function paintTransform(): void {
  const img = $('preview') as HTMLImageElement | null;
  if (img) img.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom.percent / 100})`;
}

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Emit the current picker state + size override to the extension (state/size drive a re-render). */
function emitConfig(): void {
  const msg = buildConfigChanged(toolbar.selectedState, toolbar.sizeText);
  const sizeInput = $('sizeInput') as HTMLInputElement | null;
  if ('error' in msg) {
    if (sizeInput) sizeInput.style.borderColor = 'var(--vscode-inputValidation-errorBorder, #f14c4c)';
    return;
  }
  if (sizeInput) sizeInput.style.borderColor = '';
  vscode.postMessage(msg);
}

function paintToolbar(): void {
  const bar = $('toolbar');
  if (!bar) return;
  const meta = state.drawable;

  // State picker: visible only for state-sensitive drawables (P1-D AC3).
  const picker = $('statePicker') as HTMLSelectElement | null;
  const pickerWrap = $('statePickerWrap');
  if (pickerWrap) pickerWrap.style.display = pickerVisible(meta) ? '' : 'none';
  if (picker && picker.options.length === 0) {
    for (const s of DRAWABLE_STATES) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      picker.appendChild(opt);
    }
  }
  if (picker) picker.value = toolbar.selectedState;

  // Static-preview badge (DRW-04) + selector matched-item (P1-D AC2).
  const badge = $('badge');
  if (badge) badge.style.display = meta?.staticPreviewBadge ? '' : 'none';
  const matched = $('matched');
  if (matched) {
    const label = matchedLabel(meta?.matched);
    matched.textContent = label;
    matched.style.display = label ? '' : 'none';
  }

  // Config controls (T51, CFG-01..04): populate the static option lists once, then sync values.
  const nightToggle = $('nightToggle') as HTMLInputElement | null;
  if (nightToggle) nightToggle.checked = toolbar.night;

  const devicePicker = $('devicePicker') as HTMLSelectElement | null;
  if (devicePicker && devicePicker.options.length === 0) {
    for (const d of DEVICE_PRESETS) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.label;
      devicePicker.appendChild(opt);
    }
  }
  if (devicePicker) devicePicker.value = toolbar.deviceId;

  const orientationPicker = $('orientationPicker') as HTMLSelectElement | null;
  if (orientationPicker && orientationPicker.options.length === 0) {
    for (const o of ORIENTATION_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      orientationPicker.appendChild(opt);
    }
  }
  if (orientationPicker) orientationPicker.value = toolbar.orientation;

  const densityPicker = $('densityPicker') as HTMLSelectElement | null;
  if (densityPicker && densityPicker.options.length === 0) {
    for (const d of DENSITIES) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      densityPicker.appendChild(opt);
    }
  }
  if (densityPicker) densityPicker.value = toolbar.density;

  const themePicker = $('themePicker') as HTMLSelectElement | null;
  if (themePicker && themePicker.options.length !== themeOptions.length) {
    themePicker.innerHTML = '';
    for (const t of orderThemesForPicker(themeOptions)) {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.isProjectTheme ? `${t.name} (project)` : t.name;
      themePicker.appendChild(opt);
    }
  }
  if (themePicker && themeOptions.some((t) => t.name === toolbar.themeName)) themePicker.value = toolbar.themeName;
}

function paint(): void {
  const img = $('preview') as HTMLImageElement | null;
  if (img) {
    if (state.imageUri) {
      img.src = state.imageUri;
      img.style.display = '';
      // Dimmed while stale (a retained render after a failure) or busy (a new one in progress).
      img.style.opacity = state.stale || state.busy ? '0.4' : '1';
    } else {
      img.style.display = 'none';
    }
  }

  const busyOverlay = $('busyOverlay');
  if (busyOverlay) busyOverlay.style.display = state.busy ? 'flex' : 'none';
  const busyLabel = $('busyLabel');
  if (busyLabel) busyLabel.textContent = state.busyLabel ?? '';

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
  const data = event.data as WebviewMessage | { type: 'setThemes'; themes: ThemeOption[] } | {
    type: 'setConfig';
    config: {
      themeName: string;
      isProjectTheme: boolean;
      night: boolean;
      deviceId: string;
      orientation: Orientation;
      density: Density;
      zoom: ZoomState['zoom'];
    };
  };

  // Theme list + persisted-config hydration (CFG-04/CFG-05, T51/T53) aren't render outcomes, so they
  // are handled here directly rather than through the render view model.
  if (data.type === 'setThemes') {
    themeOptions = data.themes;
    paintToolbar();
    return;
  }
  if (data.type === 'setConfig') {
    toolbar = hydrateToolbarState(toolbar, data.config);
    paintToolbar();
    applyZoom(data.config.zoom);
    return;
  }

  state = reduce(state, data as WebviewMessage);
  if (state.canvasCapped) zoom = applyCanvasCapped(zoom);
  paint();
  paintToolbar();
  applyZoom(zoom.zoom); // re-resolve against the (possibly new) image size, e.g. after setImage
});

// Wheel: plain wheel pans; ctrl/cmd+wheel (browser's pinch-zoom gesture) zooms (T52, UX-03).
$('stage')?.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      applyZoom(typeof zoom.zoom === 'number' ? zoom.zoom - e.deltaY : zoom.percent - e.deltaY);
    } else {
      const stage = $('stage');
      const rect = stage?.getBoundingClientRect();
      pan = clampPan(
        { x: pan.x - e.deltaX, y: pan.y - e.deltaY },
        state.imageWidth ?? 1,
        state.imageHeight ?? 1,
        rect?.width ?? 1,
        rect?.height ?? 1,
        zoom.percent,
      );
      paintTransform();
    }
  },
  { passive: false },
);

// Drag-to-pan (gesture pan, T52/UX-03).
let dragStart: { x: number; y: number; pan: PanOffset } | undefined;
$('stage')?.addEventListener('pointerdown', (e: PointerEvent) => {
  dragStart = { x: e.clientX, y: e.clientY, pan: { ...pan } };
});
window.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragStart) return;
  const stage = $('stage');
  const rect = stage?.getBoundingClientRect();
  pan = clampPan(
    { x: dragStart.pan.x + (e.clientX - dragStart.x), y: dragStart.pan.y + (e.clientY - dragStart.y) },
    state.imageWidth ?? 1,
    state.imageHeight ?? 1,
    rect?.width ?? 1,
    rect?.height ?? 1,
    zoom.percent,
  );
  paintTransform();
});
window.addEventListener('pointerup', () => {
  dragStart = undefined;
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

document.addEventListener('change', (e) => {
  const target = e.target as HTMLElement;
  if (target && target.id === 'statePicker') {
    toolbar = { ...toolbar, selectedState: (target as HTMLSelectElement).value as DrawableStateName };
    emitConfig();
  }
  if (target && target.id === 'sizeInput') {
    toolbar = { ...toolbar, sizeText: (target as HTMLInputElement).value };
    emitConfig();
  }
  if (target && target.id === 'nightToggle') {
    toolbar = { ...toolbar, night: (target as HTMLInputElement).checked };
    vscode.postMessage(buildNightChanged(toolbar.night));
  }
  if (target && target.id === 'devicePicker') {
    toolbar = { ...toolbar, deviceId: (target as HTMLSelectElement).value };
    vscode.postMessage(buildDeviceChanged(toolbar.deviceId));
  }
  if (target && target.id === 'orientationPicker') {
    toolbar = { ...toolbar, orientation: (target as HTMLSelectElement).value as Orientation };
    vscode.postMessage(buildOrientationChanged(toolbar.orientation));
  }
  if (target && target.id === 'densityPicker') {
    toolbar = { ...toolbar, density: (target as HTMLSelectElement).value as Density };
    vscode.postMessage(buildDensityChanged(toolbar.density));
  }
  if (target && target.id === 'themePicker') {
    const name = (target as HTMLSelectElement).value;
    const theme = themeOptions.find((t) => t.name === name) ?? { name, isProjectTheme: false, source: 'platform' as const };
    toolbar = { ...toolbar, themeName: theme.name, isProjectTheme: theme.isProjectTheme };
    vscode.postMessage(buildThemeChanged(theme));
  }
});

// Signal readiness so the extension can flush any queued state.
vscode.postMessage({ type: 'ready' });
paint();
paintToolbar();
paintTransform();
