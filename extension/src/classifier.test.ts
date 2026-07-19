import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { classify, ELIGIBILITY, firstRootElement, isEligible } from './classifier';

const SHARED_JSON = path.join(__dirname, '..', '..', 'shared', 'eligibility.json');

describe('shared eligibility constants (guard)', () => {
  it('classifier.ts ELIGIBILITY is value-identical to shared/eligibility.json', () => {
    const shared = JSON.parse(fs.readFileSync(SHARED_JSON, 'utf8'));
    // Deep-equal both ways so neither side may add, drop, reorder, or rename a key/value.
    expect(JSON.parse(JSON.stringify(ELIGIBILITY))).toEqual(shared);
  });
});

describe('classify — path heuristic', () => {
  it('classifies a layout XML by its res/layout dir', () => {
    expect(classify('/proj/app/src/main/res/layout/main.xml')).toEqual({ kind: 'layout' });
  });

  it('classifies a qualified layout dir', () => {
    expect(classify('/proj/res/layout-sw600dp/main.xml')).toEqual({ kind: 'layout' });
  });

  it('classifies a drawable XML by its res/drawable dir', () => {
    expect(classify('/proj/res/drawable/ic_star.xml')).toEqual({ kind: 'drawableXml' });
  });

  it('classifies a mipmap XML as a drawable', () => {
    expect(classify('/proj/res/mipmap-anydpi-v26/ic_launcher.xml')).toEqual({ kind: 'drawableXml' });
  });

  it('classifies a color state list by its res/color dir', () => {
    expect(classify('/proj/res/color/button_tint.xml')).toEqual({ kind: 'color' });
  });

  it('classifies a .9.png as a nine-patch regardless of dir', () => {
    expect(classify('/proj/res/drawable/button.9.png')).toEqual({ kind: 'ninePatch' });
    expect(classify('/proj/res/drawable-xhdpi/button.9.PNG'.toLowerCase())).toEqual({ kind: 'ninePatch' });
  });

  it('reports a non-previewable resource type dir as unsupported', () => {
    const c = classify('/proj/res/values/strings.xml');
    expect(c.kind).toBe('unsupported');
    expect((c as { reason: string }).reason).toContain('values');
  });

  it('reports a non-XML extension as unsupported', () => {
    expect(classify('/proj/res/layout/main.txt').kind).toBe('unsupported');
    expect(classify('/proj/res/drawable/photo.png').kind).toBe('unsupported');
  });
});

describe('classify — .axml and legacy casing (.NET / Xamarin)', () => {
  it('accepts .axml layout files', () => {
    expect(classify('/proj/Resources/layout/Main.axml')).toEqual({ kind: 'layout' });
  });

  it('accepts legacy-cased Resources/Layout dirs', () => {
    expect(classify('/proj/Resources/Layout/Main.axml')).toEqual({ kind: 'layout' });
    expect(classify('/proj/RESOURCES/DRAWABLE/Bg.xml')).toEqual({ kind: 'drawableXml' });
  });
});

describe('classify — root-element sniff fallback', () => {
  it('sniffs a drawable when the path dir is not a resource type', () => {
    expect(classify('/tmp/scratch/thing.xml', '<vector xmlns:android="..."></vector>')).toEqual({
      kind: 'drawableXml',
    });
    expect(classify('/tmp/shape.xml', '<?xml version="1.0"?>\n<shape />')).toEqual({ kind: 'drawableXml' });
    expect(classify('/tmp/sel.xml', '<selector><item/></selector>')).toEqual({ kind: 'drawableXml' });
  });

  it('sniffs a layout for a framework or data-binding root', () => {
    expect(classify('/tmp/foo.xml', '<LinearLayout />')).toEqual({ kind: 'layout' });
    expect(classify('/tmp/foo.xml', '<!-- c -->\n<layout><data/></layout>')).toEqual({ kind: 'layout' });
    expect(classify('/tmp/foo.xml', '<merge></merge>')).toEqual({ kind: 'layout' });
    expect(classify('/tmp/foo.xml', '<com.example.CustomView />')).toEqual({ kind: 'layout' });
  });

  it('reports unsupported when neither path nor sniff resolves', () => {
    expect(classify('/tmp/foo.xml').kind).toBe('unsupported');
    expect(classify('/tmp/foo.xml', '   \n  ').kind).toBe('unsupported');
  });

  it('path evidence wins over a misleading sniff', () => {
    // A <selector> under color/ is a ColorStateList even though <selector> is also a drawable root.
    expect(classify('/proj/res/color/tint.xml', '<selector><item/></selector>')).toEqual({ kind: 'color' });
  });
});

describe('firstRootElement / isEligible', () => {
  it('skips prolog and comments', () => {
    expect(firstRootElement('<?xml version="1.0"?>\n<!-- hi -->\n<vector/>')).toBe('vector');
  });

  it('isEligible is false only for unsupported', () => {
    expect(isEligible({ kind: 'layout' })).toBe(true);
    expect(isEligible({ kind: 'unsupported', reason: 'x' })).toBe(false);
  });
});
