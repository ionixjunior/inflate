import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ProtocolValidationError,
  parseDevicePresetList,
  parseInitializeParams,
  parseRenderRequest,
  parseRenderResponse,
  parseThemeInfoList,
} from './protocol';

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'docs', 'protocol', 'fixtures');

function loadFixture(name: string): unknown {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
  return JSON.parse(raw);
}

describe('protocol DTOs — shared fixture round-trips (docs/protocol/fixtures)', () => {
  it('parses render-request.json and tolerates its unknown _extra field', () => {
    const request = parseRenderRequest(loadFixture('render-request.json'));
    expect(request.id).toBe(42);
    expect(request.docKind).toBe('layout');
    expect(request.packageName).toBe('com.example.app');
    expect(request.roots).toEqual([
      '/Users/dev/project/app/src/main/res',
      '/Users/dev/project/app/src/debug/res',
    ]);
    expect(request.config.device.id).toBe('phone');
    expect(request.config.drawable?.states).toEqual(['pressed']);
    expect(request.config.drawable?.sizeDp).toEqual({ w: 128, h: 128 });
    expect(request.timeoutMs).toBe(15000);
    // JSON.parse keeps unknown fields on the plain object; re-serializing must not choke on it.
    expect(() => JSON.stringify(request)).not.toThrow();
  });

  it('parses render-response-ok.json as the ok variant with no error field', () => {
    const response = parseRenderResponse(loadFixture('render-response-ok.json'));
    expect(response.status).toBe('ok');
    expect(response.pngPath).toBe(
      '/Users/dev/.config/Code/User/globalStorage/inflate/session/win-1/renders/42.png',
    );
    expect(response.imageWidth).toBe(411);
    expect(response.imageHeight).toBe(891);
    expect(response.warnings).toEqual([]);
    expect(response.error).toBeUndefined();
    expect(response.sessionRebuilt).toBe(false);
  });

  it('parses render-response-error.json as the error variant with no pngPath', () => {
    const response = parseRenderResponse(loadFixture('render-response-error.json'));
    expect(response.status).toBe('error');
    expect(response.pngPath).toBeUndefined();
    expect(response.error?.message).toBe('method not yet implemented: render');
    expect(response.error?.line).toBe(1);
  });

  it('parses render-response-warnings.json with all 6 warning kinds and matched-state/canvas-capped fields', () => {
    const response = parseRenderResponse(loadFixture('render-response-warnings.json'));
    expect(response.status).toBe('ok');
    expect(response.warnings.map((w) => w.kind)).toEqual([
      'unresolvedRef',
      'substitutedClass',
      'bindingReplaced',
      'levelDefault',
      'notice',
      'materialAttrMissing',
    ]);
    expect(response.canvasCapped).toBe(true);
    expect(response.matchedStateItem).toEqual({ index: 2, stateAttrs: ['state_pressed'] });
    expect(response.staticPreviewBadge).toBe(true);
  });

  it('parses initialize-params.json', () => {
    const params = parseInitializeParams(loadFixture('initialize-params.json'));
    expect(params.compileSdkVersion).toBe(34);
    expect(params.logLevel).toBe('info');
    expect(params.libraryPackages).toEqual(['com.google.android.material', 'androidx.appcompat']);
  });

  it('parses theme-info-list.json with one entry per ThemeInfo.source', () => {
    const themes = parseThemeInfoList(loadFixture('theme-info-list.json'));
    expect(themes.map((t) => t.source)).toEqual(['project', 'material', 'appcompat', 'platform']);
    expect(themes[0].isProjectTheme).toBe(true);
  });

  it('parses device-presets.json with the 5 required built-in presets (P1-E AC2)', () => {
    const presets = parseDevicePresetList(loadFixture('device-presets.json'));
    expect(presets.map((p) => p.id)).toEqual([
      'smallPhone',
      'phone',
      'largePhone',
      'tablet7',
      'tablet10',
    ]);
    expect(presets).toHaveLength(5);
  });

  it('rejects invalid/render-request-missing-id.json naming the missing id field', () => {
    let thrown: unknown;
    try {
      parseRenderRequest(loadFixture(path.join('invalid', 'render-request-missing-id.json')));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ProtocolValidationError);
    expect((thrown as ProtocolValidationError).field).toBe('id');
    expect((thrown as ProtocolValidationError).dto).toBe('RenderRequest');
  });

  it('rejects invalid/render-response-missing-status.json naming the missing status field', () => {
    let thrown: unknown;
    try {
      parseRenderResponse(loadFixture(path.join('invalid', 'render-response-missing-status.json')));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ProtocolValidationError);
    expect((thrown as ProtocolValidationError).field).toBe('status');
  });
});
