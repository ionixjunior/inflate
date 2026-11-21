/**
 * Byte guards for the `line-endings/crlf` corpus fixture: the render comparison against the
 * `gradle/main` golden only proves CRLF handling while the fixture really holds CRLF line endings
 * and the same layout. `.gitattributes` keeps git from normalizing it on commit or checkout.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const CRLF_LAYOUT = path.join(REPO_ROOT, 'fixtures/line-endings/res/layout/main.xml');
const LF_LAYOUT = path.join(REPO_ROOT, 'fixtures/gradle-sample/app/src/main/res/layout/main.xml');

describe('line-endings/crlf fixture', () => {
  it('ends every line with CRLF', () => {
    const text = fs.readFileSync(CRLF_LAYOUT, 'utf8');

    expect(text.match(/\r\n/g)?.length).toBe(26);
    expect(text.match(/\n/g)?.length).toBe(26);
  });

  it('holds the gradle/main layout apart from line endings', () => {
    const crlf = fs.readFileSync(CRLF_LAYOUT, 'utf8');
    const lf = fs.readFileSync(LF_LAYOUT, 'utf8');

    expect(crlf.replace(/\r\n/g, '\n')).toBe(lf);
  });
});
