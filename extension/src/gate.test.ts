import { describe, expect, it } from 'vitest';
import { singleFlight } from './gate';

describe('singleFlight (T79, HOST-04 AC4 — render paths must never race two concurrent installs)', () => {
  it('runs fn once for concurrent callers and shares the result', async () => {
    let calls = 0;
    const gated = singleFlight(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return 'ok';
    });

    const [a, b] = await Promise.all([gated(), gated()]);

    expect(calls).toBe(1);
    expect(a).toBe('ok');
    expect(b).toBe('ok');
  });

  it('clears the in-flight slot on rejection so the next call re-runs fn', async () => {
    let calls = 0;
    const gated = singleFlight(async () => {
      calls++;
      if (calls === 1) throw new Error('first attempt fails');
      return 'ok';
    });

    await expect(gated()).rejects.toThrow('first attempt fails');
    await expect(gated()).resolves.toBe('ok');
    expect(calls).toBe(2);
  });

  it('does not memoize a resolved call — the next call re-runs fn', async () => {
    let calls = 0;
    const gated = singleFlight(async () => {
      calls++;
      return calls;
    });

    await expect(gated()).resolves.toBe(1);
    await expect(gated()).resolves.toBe(2);
    expect(calls).toBe(2);
  });
});
