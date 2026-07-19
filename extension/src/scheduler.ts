/**
 * RenderScheduler (T36, design component #4, UX-02/HOST-02, P1-F AC1–AC4). Turns save / config /
 * refresh / dependency triggers into host render calls with:
 *
 *  - **per-document monotonic request IDs** — a single increasing counter; each document tracks its
 *    own latest id;
 *  - **latest-wins coalescing** — at most one render is in flight per document and at most one is
 *    pending; a burst of saves collapses to (in-flight) + (one pending carrying the latest cause);
 *  - **stale-response discard** — a response whose id is older than the document's latest requested
 *    id is dropped, never delivered (P1-F AC3: no stale content is ever shown after a newer save);
 *  - **dependency invalidation before re-render** — a dependency save invalidates the host's cached
 *    repository (with the changed paths) *before* the dependent render is dispatched;
 *  - **refresh sends the dirty buffer** — `refresh` carries the editor's current (unsaved) content as
 *    `inlineContent`; every other cause lets the host read from disk.
 *
 * All I/O is behind {@link SchedulerDeps} so the scheduler is unit-tested against a fake host with
 * no VS Code or JVM. The extension wires the real HostManager, ResourceRootResolver, ConfigStore,
 * DocumentClassifier, and PreviewPanelManager into those deps.
 */

import * as path from 'path';
import { DocKind, PreviewConfig, RenderRequest, RenderResponse } from './protocol';

export type RenderCause = 'save' | 'depSave' | 'config' | 'refresh' | 'reopen';

/** The host surface the scheduler drives (a subset of HostManager). */
export interface SchedulerHost {
  render(req: RenderRequest): Promise<RenderResponse>;
  invalidate(paths: string[]): Promise<unknown>;
}

export interface SchedulerDeps {
  host: SchedulerHost;
  /** Ordered resource roots + package for a document (ResourceRootResolver). */
  resolveRoots(docPath: string): { roots: string[]; packageName: string };
  /** Document kind for the render request (DocumentClassifier). */
  classify(docPath: string): DocKind;
  /** Current per-file preview configuration (ConfigStore). */
  getConfig(docPath: string): PreviewConfig;
  /** The editor's current (possibly unsaved) buffer content — used by `refresh`. */
  readBuffer(docPath: string): string;
  /** Deliver a completed render (ok or domain-error) to the panel. */
  onResult(docPath: string, response: RenderResponse): void;
  /** Deliver a host-level failure (crash/timeout) to the panel. Optional. */
  onHostError?(docPath: string, error: Error): void;
  /** Per-render timeout carried in the request (default 15000). */
  timeoutMs?: number;
}

interface DocState {
  /** The latest requested id for this document (monotonic); responses older than this are stale. */
  lastRequestId: number;
  inFlight: boolean;
  pendingCause: RenderCause | null;
  /** Dependency paths accumulated since the last dispatch, invalidated before the next render. */
  pendingInvalidate: Set<string>;
  /** Dependency file paths reported by this document's most recent successful render. */
  dependencies: Set<string>;
  roots: string[];
  packageName: string;
  /** Resolvers waiting for this document to become fully idle ({@link RenderScheduler.settled}). */
  idleWaiters: Array<() => void>;
}

/** Normalize a path for stable comparison/keys across triggers and dependency lists. */
function norm(p: string): string {
  return path.resolve(p);
}

/** True when `savedPath` sits inside a `values[-qualifier]` dir under any of `roots` (conservative
 * dependency watch: values files are repository-materialized and can affect any render). */
function isUnderValuesDir(savedPath: string, roots: string[]): boolean {
  const normalized = norm(savedPath);
  return roots.some((root) => {
    const r = norm(root);
    if (!(normalized === r || normalized.startsWith(r + path.sep))) return false;
    const rel = normalized.slice(r.length);
    return /[\\/]values[^\\/]*[\\/]/i.test(rel);
  });
}

export class RenderScheduler {
  private counter = 0;
  private readonly states = new Map<string, DocState>();

  constructor(private readonly deps: SchedulerDeps) {}

  /** Dependency paths this document's last render declared (test/observability hook). */
  dependenciesOf(docPath: string): string[] {
    return [...(this.states.get(norm(docPath))?.dependencies ?? [])];
  }

  private stateFor(docPath: string): DocState {
    const key = norm(docPath);
    let st = this.states.get(key);
    if (!st) {
      st = {
        lastRequestId: 0,
        inFlight: false,
        pendingCause: null,
        pendingInvalidate: new Set(),
        dependencies: new Set(),
        roots: [],
        packageName: '',
        idleWaiters: [],
      };
      this.states.set(key, st);
    }
    return st;
  }

  /** Resolves once `docPath` has no in-flight or pending render (used to await the initial preview). */
  settled(docPath: string): Promise<void> {
    const st = this.states.get(norm(docPath));
    if (!st || (!st.inFlight && st.pendingCause === null)) return Promise.resolve();
    return new Promise<void>((resolve) => st.idleWaiters.push(resolve));
  }

  private resolveIdleIfSettled(st: DocState): void {
    if (st.inFlight || st.pendingCause !== null) return;
    const waiters = st.idleWaiters;
    st.idleWaiters = [];
    for (const w of waiters) w();
  }

  /**
   * Request a render of `docPath` for `cause`. Reserves a fresh monotonic id (making any in-flight
   * response stale) and either dispatches immediately or leaves it as the single pending request.
   * `changedPaths` (dependency saves) are accumulated and invalidated before the next dispatch.
   */
  requestRender(docPath: string, cause: RenderCause, changedPaths: string[] = []): void {
    const st = this.stateFor(docPath);
    st.lastRequestId = ++this.counter;
    st.pendingCause = cause;
    for (const p of changedPaths) st.pendingInvalidate.add(norm(p));
    if (!st.inFlight) this.pump(docPath);
  }

  /** A file was saved: re-render the doc itself (`save`) and every open preview that depends on it
   * (`depSave`, which invalidates first). */
  notifyFileSaved(savedPath: string): void {
    const savedKey = norm(savedPath);
    for (const [docKey, st] of this.states) {
      if (docKey === savedKey) {
        this.requestRender(docKey, 'save');
      } else if (st.dependencies.has(savedKey) || isUnderValuesDir(savedKey, st.roots)) {
        this.requestRender(docKey, 'depSave', [savedKey]);
      }
    }
  }

  /** A config toggle for a document → re-render with the new config. */
  notifyConfigChanged(docPath: string): void {
    this.requestRender(docPath, 'config');
  }

  /** Explicit refresh → render the current (possibly unsaved) buffer. */
  refresh(docPath: string): void {
    this.requestRender(docPath, 'refresh');
  }

  private pump(docPath: string): void {
    const key = norm(docPath);
    const st = this.states.get(key);
    if (!st || st.pendingCause === null) return;

    const id = st.lastRequestId;
    const cause = st.pendingCause;
    st.pendingCause = null;
    st.inFlight = true;

    const invalidatePaths = [...st.pendingInvalidate];
    st.pendingInvalidate.clear();

    const { roots, packageName } = this.deps.resolveRoots(key);
    st.roots = roots;
    st.packageName = packageName;

    const request: RenderRequest = {
      id,
      docPath: key,
      docKind: this.deps.classify(key),
      roots,
      packageName,
      config: this.deps.getConfig(key),
      timeoutMs: this.deps.timeoutMs ?? 15000,
    };
    if (cause === 'refresh') request.inlineContent = this.deps.readBuffer(key);

    const dispatch = invalidatePaths.length > 0
      ? this.deps.host.invalidate(invalidatePaths).then(() => this.deps.host.render(request))
      : this.deps.host.render(request);

    dispatch.then(
      (response) => this.onResponse(key, id, response),
      (error) => this.onFailure(key, id, error as Error),
    );
  }

  private onResponse(docKey: string, id: number, response: RenderResponse): void {
    const st = this.states.get(docKey);
    if (!st) return;
    st.inFlight = false;
    if (id < st.lastRequestId) {
      // A newer request was made while this one was in flight: discard this (now-stale) result and
      // dispatch the latest — no stale content is ever delivered (P1-F AC3).
      this.pump(docKey);
      return;
    }
    if (response.status === 'ok') st.dependencies = new Set(response.dependencies.map(norm));
    this.deps.onResult(docKey, response);
    this.resolveIdleIfSettled(st);
  }

  private onFailure(docKey: string, id: number, error: Error): void {
    const st = this.states.get(docKey);
    if (!st) return;
    st.inFlight = false;
    if (id < st.lastRequestId) {
      this.pump(docKey);
      return;
    }
    this.deps.onHostError?.(docKey, error);
    this.resolveIdleIfSettled(st);
  }
}
