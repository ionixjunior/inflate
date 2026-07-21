import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // out/test/integration -> extension root is three levels up.
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const extensionTestsPath = path.resolve(__dirname, './index');
    // T18: point HostManager at the scripted fake host (T17) instead of a real JVM — the render
    // RPC is still stubbed on the real host (T13) until Phase 6, so no integration test needs the
    // real ~170 MB engine or a JDK. See activation.ts's resolveHostCommand().
    const fakeHostScript = path.resolve(extensionDevelopmentPath, 'src/test/fake-host.js');
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: {
        INFLATE_TEST_FAKE_HOST: fakeHostScript,
        ...(process.env.MOCHA_GREP ? { MOCHA_GREP: process.env.MOCHA_GREP } : {}),
      },
      launchArgs: ['--disable-extensions', '--disable-gpu'],
    });
  } catch (err) {
    console.error('Failed to run integration tests', err);
    process.exit(1);
  }
}

void main();
