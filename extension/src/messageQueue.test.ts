import { describe, expect, it } from 'vitest';
import { PendingMessageQueue } from './messageQueue';

describe('PendingMessageQueue — FIFO ordering (fix-pack POLISH-04, FP-1 AC7)', () => {
  it('flushes every queued message in the order it was pushed', () => {
    const queue = new PendingMessageQueue();
    queue.push({ type: 'setConfig', config: { night: true } });
    queue.push({ type: 'setBusy', label: 'Rendering…' });
    queue.push({ type: 'setImage', uri: 'img/1.png' });

    expect(queue.flush()).toEqual([
      { type: 'setConfig', config: { night: true } },
      { type: 'setBusy', label: 'Rendering…' },
      { type: 'setImage', uri: 'img/1.png' },
    ]);
  });

  it('flushing empties the queue — a second flush returns nothing', () => {
    const queue = new PendingMessageQueue();
    queue.push({ type: 'setStatus', status: 'a' });
    queue.flush();
    expect(queue.flush()).toEqual([]);
  });

  it('starts empty', () => {
    expect(new PendingMessageQueue().flush()).toEqual([]);
  });
});
