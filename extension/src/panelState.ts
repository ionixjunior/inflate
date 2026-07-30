/**
 * Vscode-free authoritative snapshot of everything a preview webview has been told (DF-6, UX-06).
 * Replaces `messageQueue.ts`'s `PendingMessageQueue`, which only ever held messages posted before
 * the FIRST `ready` — once VS Code destroys a hidden webview's context (`retainContextWhenHidden:
 * false`) and it reloads on reveal, a queue-flush-only design has nothing left to deliver, so the
 * tab comes back blank. `PanelStateStore` instead keeps a latest-wins snapshot of every message type
 * and can {@link replay} it in full on EVERY `ready`, first load or reload alike.
 *
 * Slots (latest-wins, one per extension→webview message type — `setConfig`/`setThemes`/`setImage`/
 * `setError`/`fileGone`/`setBusy`): `result` holds whichever of `setImage`/`setError`/`fileGone`
 * landed most recently (they are mutually exclusive as a displayed state); `lastGoodImage` is a
 * SEPARATE slot updated only by `setImage`, so a later `setError` can still replay the prior good
 * image alongside it (dimmed + stale, UX-04's existing contract, restated over replay by AC1); `busy`
 * is cleared the moment a settling message (`setImage`/`setError`/`fileGone`) is recorded, so a
 * finished render never replays as a stuck spinner.
 */
export interface StoreMessage {
  type: string;
  [key: string]: unknown;
}

export class PanelStateStore {
  private config?: StoreMessage;
  private themes?: StoreMessage;
  private result?: StoreMessage;
  private lastGoodImage?: StoreMessage;
  private busy?: StoreMessage;

  /** Merge one extension→webview message into the snapshot (latest-wins per slot). */
  record(message: StoreMessage): void {
    switch (message.type) {
      case 'setConfig':
        this.config = message;
        break;
      case 'setThemes':
        this.themes = message;
        break;
      case 'setImage':
        this.result = message;
        this.lastGoodImage = message;
        this.busy = undefined;
        break;
      case 'setError':
      case 'fileGone':
        this.result = message;
        this.busy = undefined;
        break;
      case 'setBusy':
        this.busy = message;
        break;
      default:
        break;
    }
  }

  /**
   * The canonical delivery sequence (UX-06 AC7): config hydration, theme list, then the current
   * result — the prior good image first if the result is an error (stale display), then the result
   * itself — then the in-progress busy phase if one is still unsettled. `deriveConfig`, when given,
   * replaces the stored config slot so the caller can re-derive it fresh from the source of truth
   * (ConfigStore) instead of replaying a possibly stale open-time copy (AC5); omitted, the last
   * recorded `setConfig` message is used as-is.
   */
  replay(deriveConfig?: () => StoreMessage): StoreMessage[] {
    const sequence: StoreMessage[] = [];
    const config = deriveConfig ? deriveConfig() : this.config;
    if (config) sequence.push(config);
    if (this.themes) sequence.push(this.themes);
    if (this.result?.type === 'setError' && this.lastGoodImage) sequence.push(this.lastGoodImage);
    if (this.result) sequence.push(this.result);
    if (this.busy) sequence.push(this.busy);
    return sequence;
  }
}
