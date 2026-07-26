import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { InflateApi } from '../../extension';

/**
 * T53 config-toolbar integration test (CFG-01..05, P1-E AC1-AC5). Drives the real activation →
 * PreviewPanelManager → RenderScheduler → HostManager loop against a gradle-shaped fixture (values/
 * values-night, a tablet-sized layout dir) with the scripted fake host (T17's fake-host.js, extended
 * for T53 to echo the RenderRequest.config it received back as a 'notice' warning).
 *
 * Per the design's carry-forward guidance: this proves the EXTENSION-SIDE config plumbing — that a
 * toolbar config change reaches ConfigStore and is sent to the host as the right RenderRequest.config
 * (and that a persisted config restores on reopen). The actual qualifier-selection fidelity (which
 * -night/-sw600dp resource actually gets picked) is proven host-side by engineTest (T25
 * QualifierTest); the fake host here does not resolve real resources, so it cannot demonstrate that
 * half of P1-E AC1-AC3 — it only demonstrates that the extension asked for the right thing.
 */
suite('Inflate config toolbar (T53)', () => {
  const rootDir = path.join(os.tmpdir(), 'inflate-config-test');
  const layoutDir = path.join(rootDir, 'res', 'layout');
  const valuesDir = path.join(rootDir, 'res', 'values');
  const valuesNightDir = path.join(rootDir, 'res', 'values-night');
  const mainFile = path.join(layoutDir, 'main.xml');

  const validLayout = '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" />';

  suiteSetup(() => {
    fs.mkdirSync(layoutDir, { recursive: true });
    fs.mkdirSync(valuesDir, { recursive: true });
    fs.mkdirSync(valuesNightDir, { recursive: true });
    fs.writeFileSync(mainFile, validLayout);
    fs.writeFileSync(path.join(valuesDir, 'colors.xml'), '<resources><color name="bg">#FFFFFF</color></resources>');
    fs.writeFileSync(
      path.join(valuesNightDir, 'colors.xml'),
      '<resources><color name="bg">#000000</color></resources>',
    );
  });

  suiteTeardown(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  async function api(): Promise<InflateApi> {
    const ext = vscode.extensions.getExtension<InflateApi>('inflate.inflate');
    assert.ok(ext, 'extension inflate.inflate should be present');
    return ext.activate();
  }

  async function waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error('condition not met within timeout');
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  function configNotice(a: InflateApi, docPath: string): string {
    const warnings = a.panelManager.lastApplied(docPath)?.warnings ?? [];
    const notice = warnings.find((w) => w.kind === 'notice');
    assert.ok(notice, 'expected the fake host to echo the applied config as a notice warning');
    return notice!.message;
  }

  test('day/night toggle sends the flipped night flag and re-renders (CFG-01, P1-E AC1)', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');
    assert.match(configNotice(a, mainFile), /night=false/);
    const beforeId = a.panelManager.lastApplied(mainFile)!.responseId!;

    a.panelManager.deliverWebviewMessage(mainFile, { type: 'configChanged', night: true });
    await waitFor(() => (a.panelManager.lastApplied(mainFile)?.responseId ?? 0) > beforeId);

    assert.match(configNotice(a, mainFile), /night=true/, 'the render request must carry night=true');
  });

  test('a device preset + orientation pick sends the matching size qualifiers (CFG-02, P1-E AC2)', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');
    const beforeId = a.panelManager.lastApplied(mainFile)!.responseId!;

    a.panelManager.deliverWebviewMessage(mainFile, {
      type: 'configChanged',
      deviceId: 'tablet7',
      orientation: 'landscape',
    });
    await waitFor(() => (a.panelManager.lastApplied(mainFile)?.responseId ?? 0) > beforeId);

    const notice = configNotice(a, mainFile);
    assert.match(notice, /device=tablet7/);
    assert.match(notice, /widthDp=600/);
    assert.match(notice, /heightDp=1024/);
    assert.match(notice, /orientation=landscape/);
  });

  test('a density pick re-renders with the new density (CFG-03, P1-E AC3)', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');
    const beforeId = a.panelManager.lastApplied(mainFile)!.responseId!;

    a.panelManager.deliverWebviewMessage(mainFile, { type: 'configChanged', density: 'xxxhdpi' });
    await waitFor(() => (a.panelManager.lastApplied(mainFile)?.responseId ?? 0) > beforeId);

    assert.match(configNotice(a, mainFile), /density=xxxhdpi/);
  });

  test('a theme pick applies the chosen theme to the next render (CFG-04, P1-E AC4)', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');
    const beforeId = a.panelManager.lastApplied(mainFile)!.responseId!;

    a.panelManager.deliverWebviewMessage(mainFile, {
      type: 'configChanged',
      themeName: 'Theme.MyApp',
      isProjectTheme: true,
    });
    await waitFor(() => (a.panelManager.lastApplied(mainFile)?.responseId ?? 0) > beforeId);

    assert.match(configNotice(a, mainFile), /theme=Theme\.MyApp/);
  });

  test('config and zoom persist per file and restore exactly on preview reopen (CFG-05, P1-E AC5)', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');
    const idAfterOpen = a.panelManager.lastApplied(mainFile)!.responseId!;

    // Change several config fields and the zoom level, then wait for that render to land.
    a.panelManager.deliverWebviewMessage(mainFile, {
      type: 'configChanged',
      night: true,
      deviceId: 'tablet10',
      density: 'mdpi',
    });
    await waitFor(() => (a.panelManager.lastApplied(mainFile)?.responseId ?? 0) > idAfterOpen);
    const idBeforeClose = a.panelManager.lastApplied(mainFile)!.responseId!;
    a.panelManager.deliverWebviewMessage(mainFile, { type: 'zoomChanged', zoom: 150 });

    // Close the panel entirely.
    assert.ok(a.lastPanel, 'expected a panel to exist before closing it');
    a.lastPanel!.dispose();
    await waitFor(() => !a.panelManager.hasPanel(mainFile));

    // Reopen: the first NEW render after reopening must already carry the persisted config —
    // proving restore-on-reopen, not just in-session persistence.
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => (a.panelManager.lastApplied(mainFile)?.responseId ?? 0) > idBeforeClose);

    const notice = configNotice(a, mainFile);
    assert.match(notice, /night=true/, 'night must be restored on reopen');
    assert.match(notice, /device=tablet10/, 'device preset must be restored on reopen');
    assert.match(notice, /density=mdpi/, 'density must be restored on reopen');

    // Zoom is stored outside the render-request config (it never crosses the wire) — assert it via
    // the exposed ConfigStore directly (P1-E AC5's "restore it when the preview reopens").
    assert.strictEqual(a.configStore.get(mainFile).zoom, 150, 'the persisted zoom level must survive reopen');
  });

  test('a layout edge-drag delivers a customSize patch that renders with the custom device (fix-pack POLISH-07, FP-3 AC5)', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');
    const beforeId = a.panelManager.lastApplied(mainFile)!.responseId!;

    // The webview's edge-drag gesture emits exactly this shape on pointerup for a layout doc.
    a.panelManager.deliverWebviewMessage(mainFile, { type: 'configChanged', customSize: { w: 411, h: 600 } });
    await waitFor(() => (a.panelManager.lastApplied(mainFile)?.responseId ?? 0) > beforeId);

    const notice = configNotice(a, mainFile);
    assert.match(notice, /device=custom/, 'the request must carry the transient custom device id');
    assert.match(notice, /widthDp=411/);
    assert.match(notice, /heightDp=600/);
    assert.strictEqual(a.configStore.get(mainFile).preview.device.id, 'custom', 'ConfigStore must persist the custom device');
  });

  test('a drawable edge-drag delivers a drawable.sizeDp patch that renders at the dragged size (fix-pack POLISH-07, FP-3 AC4)', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');
    const beforeId = a.panelManager.lastApplied(mainFile)!.responseId!;

    // The webview's edge-drag gesture emits exactly this shape on pointerup for a drawable doc —
    // proving the extension-side plumbing only; the webview's own docKind-based routing choice
    // isn't reachable without a live DOM (see main.ts's pointerup handler).
    a.panelManager.deliverWebviewMessage(mainFile, {
      type: 'configChanged',
      drawable: { states: [], sizeDp: { w: 128, h: 256 } },
    });
    await waitFor(() => (a.panelManager.lastApplied(mainFile)?.responseId ?? 0) > beforeId);

    // drawable.sizeDp doesn't appear in the fake host's config-notice echo — assert the persisted
    // (and thus wire-carried, since getConfig() reads straight from ConfigStore) shape directly.
    assert.deepStrictEqual(a.configStore.get(mainFile).preview.drawable, { states: [], sizeDp: { w: 128, h: 256 } });
  });
});
