import * as fs from 'fs';
import * as path from 'path';

/**
 * The dev-loaded extension's ID is `<publisher>.<name>` — derived from package.json rather than
 * hardcoded: the publisher changed once already (`inflate` → `ionixjunior`, commit `abf7b75`) and
 * a hardcoded ID broke 15 integration tests on the first live CI run (2026-07-27).
 */
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'),
) as { publisher: string; name: string };

export const EXTENSION_ID = `${pkg.publisher}.${pkg.name}`;
