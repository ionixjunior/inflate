/**
 * Protocol DTOs (extension side). Single source of truth: `docs/protocol.md` + the shared
 * fixtures under `docs/protocol/fixtures/*.json` — this file and its Kotlin counterpart
 * (`host/src/main/kotlin/rpc/Dto.kt`) are both validated against those same fixtures (T10/T11/T12,
 * AD-010).
 *
 * Every parse function tolerates unknown top-level/nested fields (forward compatibility) and
 * throws a {@link ProtocolValidationError} naming the exact missing/invalid field when a fixture
 * violates the contract — never a vague generic error.
 */

export type DocKind = 'layout' | 'drawableXml' | 'ninePatch' | 'color';
export type Orientation = 'portrait' | 'landscape';
export type Density = 'mdpi' | 'hdpi' | 'xhdpi' | 'xxhdpi' | 'xxxhdpi';
export type DrawableState =
  | 'default'
  | 'pressed'
  | 'checked'
  | 'disabled'
  | 'focused'
  | 'selected'
  | 'activated';
export type WarningKind =
  | 'unresolvedRef'
  | 'substitutedClass'
  | 'bindingReplaced'
  | 'levelDefault'
  | 'notice'
  | 'materialAttrMissing';
export type ThemeSource = 'project' | 'material' | 'appcompat' | 'platform';
export type SizeBucket = 'normal' | 'large' | 'xlarge';

export interface DevicePreset {
  id: string;
  label: string;
  widthDp: number;
  heightDp: number;
  defaultDensity: string;
  sizeBucket: SizeBucket;
}

export interface PreviewConfig {
  themeName: string;
  isProjectTheme: boolean;
  night: boolean;
  device: DevicePreset;
  orientation: Orientation;
  density: Density;
  pixelScale: 1 | 2;
  drawable?: {
    states: DrawableState[];
    sizeDp?: { w: number; h: number };
  };
}

export interface RenderRequest {
  id: number;
  docPath: string;
  docKind: DocKind;
  inlineContent?: string;
  roots: string[];
  packageName: string;
  config: PreviewConfig;
  timeoutMs: number;
}

export interface Warning {
  kind: WarningKind;
  message: string;
  detail?: string;
}

export interface RenderResponse {
  id: number;
  status: 'ok' | 'error';
  pngPath?: string;
  imageWidth?: number;
  imageHeight?: number;
  staticPreviewBadge?: boolean;
  matchedStateItem?: { index: number; stateAttrs: string[] };
  canvasCapped?: boolean;
  warnings: Warning[];
  error?: { message: string; file?: string; line?: number; column?: number };
  dependencies: string[];
  timings: { prepareMs: number; inflateMs: number; renderMs: number; totalMs: number };
  sessionRebuilt: boolean;
}

export interface InitializeParams {
  layoutlibRuntimeRoot: string;
  layoutlibResourcesRoot: string;
  classpathNote: 'assembled-by-launcher';
  libraryResDirs: string[];
  libraryPackages: string[];
  outputDir: string;
  overlayDir: string;
  compileSdkVersion: 34;
  logLevel: 'info' | 'debug';
}

export interface ThemeInfo {
  name: string;
  isProjectTheme: boolean;
  source: ThemeSource;
}

/** Thrown by every parse function; `dto` + `field` pinpoint exactly what failed validation. */
export class ProtocolValidationError extends Error {
  constructor(
    public readonly dto: string,
    public readonly field: string,
    message: string,
  ) {
    super(`${dto}.${field}: ${message}`);
    this.name = 'ProtocolValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(dto: string, field: string, message: string): never {
  throw new ProtocolValidationError(dto, field, message);
}

function reqString(obj: Record<string, unknown>, dto: string, field: string): string {
  const v = obj[field];
  if (typeof v !== 'string') fail(dto, field, `required string is ${v === undefined ? 'missing' : 'not a string'}`);
  return v;
}

function reqNumber(obj: Record<string, unknown>, dto: string, field: string): number {
  const v = obj[field];
  if (typeof v !== 'number') fail(dto, field, `required number is ${v === undefined ? 'missing' : 'not a number'}`);
  return v;
}

function reqBoolean(obj: Record<string, unknown>, dto: string, field: string): boolean {
  const v = obj[field];
  if (typeof v !== 'boolean') fail(dto, field, `required boolean is ${v === undefined ? 'missing' : 'not a boolean'}`);
  return v;
}

function reqEnum<T extends string>(obj: Record<string, unknown>, dto: string, field: string, allowed: readonly T[]): T {
  const v = obj[field];
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    fail(dto, field, `required enum ${JSON.stringify(allowed)} but got ${JSON.stringify(v)}`);
  }
  return v as T;
}

function reqStringArray(obj: Record<string, unknown>, dto: string, field: string): string[] {
  const v = obj[field];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    fail(dto, field, `required string[] is ${v === undefined ? 'missing' : 'invalid'}`);
  }
  return v as string[];
}

function reqObject(obj: Record<string, unknown>, dto: string, field: string): Record<string, unknown> {
  const v = obj[field];
  if (!isRecord(v)) fail(dto, field, `required object is ${v === undefined ? 'missing' : 'not an object'}`);
  return v;
}

const DENSITIES: readonly Density[] = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];
const DOC_KINDS: readonly DocKind[] = ['layout', 'drawableXml', 'ninePatch', 'color'];
const SIZE_BUCKETS: readonly SizeBucket[] = ['normal', 'large', 'xlarge'];
const DRAWABLE_STATES: readonly DrawableState[] = [
  'default',
  'pressed',
  'checked',
  'disabled',
  'focused',
  'selected',
  'activated',
];
const WARNING_KINDS: readonly WarningKind[] = [
  'unresolvedRef',
  'substitutedClass',
  'bindingReplaced',
  'levelDefault',
  'notice',
  'materialAttrMissing',
];
const THEME_SOURCES: readonly ThemeSource[] = ['project', 'material', 'appcompat', 'platform'];

export function parseDevicePreset(value: unknown, dto = 'DevicePreset'): DevicePreset {
  if (!isRecord(value)) fail(dto, '<root>', 'expected an object');
  return {
    id: reqString(value, dto, 'id'),
    label: reqString(value, dto, 'label'),
    widthDp: reqNumber(value, dto, 'widthDp'),
    heightDp: reqNumber(value, dto, 'heightDp'),
    defaultDensity: reqString(value, dto, 'defaultDensity'),
    sizeBucket: reqEnum(value, dto, 'sizeBucket', SIZE_BUCKETS),
  };
}

export function parseDevicePresetList(value: unknown): DevicePreset[] {
  if (!Array.isArray(value)) fail('DevicePreset[]', '<root>', 'expected an array');
  return value.map((v) => parseDevicePreset(v));
}

function parsePreviewConfig(value: unknown, dto = 'PreviewConfig'): PreviewConfig {
  if (!isRecord(value)) fail(dto, '<root>', 'expected an object');
  const device = parseDevicePreset(reqObject(value, dto, 'device'), `${dto}.device`);
  const config: PreviewConfig = {
    themeName: reqString(value, dto, 'themeName'),
    isProjectTheme: reqBoolean(value, dto, 'isProjectTheme'),
    night: reqBoolean(value, dto, 'night'),
    device,
    orientation: reqEnum(value, dto, 'orientation', ORIENTATIONS),
    density: reqEnum(value, dto, 'density', DENSITIES),
    pixelScale: ((): 1 | 2 => {
      const v = value.pixelScale;
      if (v !== 1 && v !== 2) fail(dto, 'pixelScale', `required 1|2 but got ${JSON.stringify(v)}`);
      return v;
    })(),
  };
  if (value.drawable !== undefined) {
    if (!isRecord(value.drawable)) fail(dto, 'drawable', 'expected an object');
    const states = reqStringArray(value.drawable, `${dto}.drawable`, 'states');
    for (const s of states) {
      if (!(DRAWABLE_STATES as readonly string[]).includes(s)) {
        fail(`${dto}.drawable`, 'states', `unknown drawable state ${JSON.stringify(s)}`);
      }
    }
    config.drawable = { states: states as DrawableState[] };
    if (value.drawable.sizeDp !== undefined) {
      const sizeDp = value.drawable.sizeDp;
      if (!isRecord(sizeDp)) fail(`${dto}.drawable`, 'sizeDp', 'expected an object');
      config.drawable.sizeDp = {
        w: reqNumber(sizeDp, `${dto}.drawable.sizeDp`, 'w'),
        h: reqNumber(sizeDp, `${dto}.drawable.sizeDp`, 'h'),
      };
    }
  }
  return config;
}

export function parseRenderRequest(value: unknown): RenderRequest {
  const dto = 'RenderRequest';
  if (!isRecord(value)) fail(dto, '<root>', 'expected an object');
  const request: RenderRequest = {
    id: reqNumber(value, dto, 'id'),
    docPath: reqString(value, dto, 'docPath'),
    docKind: reqEnum(value, dto, 'docKind', DOC_KINDS),
    roots: reqStringArray(value, dto, 'roots'),
    packageName: reqString(value, dto, 'packageName'),
    config: parsePreviewConfig(reqObject(value, dto, 'config'), `${dto}.config`),
    timeoutMs: reqNumber(value, dto, 'timeoutMs'),
  };
  if (value.inlineContent !== undefined) {
    if (typeof value.inlineContent !== 'string') fail(dto, 'inlineContent', 'expected a string when present');
    request.inlineContent = value.inlineContent;
  }
  return request;
}

function parseWarning(value: unknown, dto = 'Warning'): Warning {
  if (!isRecord(value)) fail(dto, '<root>', 'expected an object');
  const warning: Warning = {
    kind: reqEnum(value, dto, 'kind', WARNING_KINDS),
    message: reqString(value, dto, 'message'),
  };
  if (value.detail !== undefined) {
    if (typeof value.detail !== 'string') fail(dto, 'detail', 'expected a string when present');
    warning.detail = value.detail;
  }
  return warning;
}

export function parseRenderResponse(value: unknown): RenderResponse {
  const dto = 'RenderResponse';
  if (!isRecord(value)) fail(dto, '<root>', 'expected an object');
  const status = reqEnum(value, dto, 'status', ['ok', 'error'] as const);
  const warningsRaw = value.warnings;
  if (!Array.isArray(warningsRaw)) fail(dto, 'warnings', 'required array is missing or invalid');
  const timingsObj = reqObject(value, dto, 'timings');

  const response: RenderResponse = {
    id: reqNumber(value, dto, 'id'),
    status,
    warnings: warningsRaw.map((w) => parseWarning(w, `${dto}.warnings[]`)),
    dependencies: reqStringArray(value, dto, 'dependencies'),
    timings: {
      prepareMs: reqNumber(timingsObj, `${dto}.timings`, 'prepareMs'),
      inflateMs: reqNumber(timingsObj, `${dto}.timings`, 'inflateMs'),
      renderMs: reqNumber(timingsObj, `${dto}.timings`, 'renderMs'),
      totalMs: reqNumber(timingsObj, `${dto}.timings`, 'totalMs'),
    },
    sessionRebuilt: reqBoolean(value, dto, 'sessionRebuilt'),
  };

  if (status === 'ok') {
    response.pngPath = reqString(value, dto, 'pngPath');
    response.imageWidth = reqNumber(value, dto, 'imageWidth');
    response.imageHeight = reqNumber(value, dto, 'imageHeight');
  } else {
    const errorObj = reqObject(value, dto, 'error');
    response.error = { message: reqString(errorObj, `${dto}.error`, 'message') };
    if (errorObj.file !== undefined) response.error.file = reqString(errorObj, `${dto}.error`, 'file');
    if (errorObj.line !== undefined) response.error.line = reqNumber(errorObj, `${dto}.error`, 'line');
    if (errorObj.column !== undefined) response.error.column = reqNumber(errorObj, `${dto}.error`, 'column');
  }

  if (value.staticPreviewBadge !== undefined) response.staticPreviewBadge = reqBoolean(value, dto, 'staticPreviewBadge');
  if (value.canvasCapped !== undefined) response.canvasCapped = reqBoolean(value, dto, 'canvasCapped');
  if (value.matchedStateItem !== undefined) {
    const m = reqObject(value, dto, 'matchedStateItem');
    response.matchedStateItem = {
      index: reqNumber(m, `${dto}.matchedStateItem`, 'index'),
      stateAttrs: reqStringArray(m, `${dto}.matchedStateItem`, 'stateAttrs'),
    };
  }

  return response;
}

export function parseInitializeParams(value: unknown): InitializeParams {
  const dto = 'InitializeParams';
  if (!isRecord(value)) fail(dto, '<root>', 'expected an object');
  return {
    layoutlibRuntimeRoot: reqString(value, dto, 'layoutlibRuntimeRoot'),
    layoutlibResourcesRoot: reqString(value, dto, 'layoutlibResourcesRoot'),
    classpathNote: reqEnum(value, dto, 'classpathNote', ['assembled-by-launcher'] as const),
    libraryResDirs: reqStringArray(value, dto, 'libraryResDirs'),
    libraryPackages: reqStringArray(value, dto, 'libraryPackages'),
    outputDir: reqString(value, dto, 'outputDir'),
    overlayDir: reqString(value, dto, 'overlayDir'),
    compileSdkVersion: ((): 34 => {
      const v = value.compileSdkVersion;
      if (v !== 34) fail(dto, 'compileSdkVersion', `required literal 34 but got ${JSON.stringify(v)}`);
      return v;
    })(),
    logLevel: reqEnum(value, dto, 'logLevel', ['info', 'debug'] as const),
  };
}

export function parseThemeInfo(value: unknown, dto = 'ThemeInfo'): ThemeInfo {
  if (!isRecord(value)) fail(dto, '<root>', 'expected an object');
  return {
    name: reqString(value, dto, 'name'),
    isProjectTheme: reqBoolean(value, dto, 'isProjectTheme'),
    source: reqEnum(value, dto, 'source', THEME_SOURCES),
  };
}

export function parseThemeInfoList(value: unknown): ThemeInfo[] {
  if (!Array.isArray(value)) fail('ThemeInfo[]', '<root>', 'expected an array');
  return value.map((v) => parseThemeInfo(v));
}
