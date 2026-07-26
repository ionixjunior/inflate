/**
 * A tiny FIFO queue for extension → webview messages posted before the webview signals `ready`
 * (fix-pack POLISH-04, FP-1 AC7). Replaces `PreviewPanelManager`'s old single-slot `lastMessage`,
 * which silently lost every queued message but the last (e.g. a `setConfig` hydration sent before a
 * slow-loading webview signaled ready). Kept vscode-free so its ordering guarantee is unit-testable.
 */
export class PendingMessageQueue {
  private items: unknown[] = [];

  /** Queue a message. */
  push(message: unknown): void {
    this.items.push(message);
  }

  /** Remove and return every queued message, in the order it was pushed. */
  flush(): unknown[] {
    const flushed = this.items;
    this.items = [];
    return flushed;
  }
}
