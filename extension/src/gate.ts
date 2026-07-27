/**
 * Single-flight call gate (T79, HOST-04 AC4). Wraps an async function so concurrent callers join
 * the one in-flight call instead of starting a second one — used to guarantee a render path never
 * boots the deferred placeholder host mid-download, by joining the running `prepareRealHost`
 * install instead of racing a second one. Only the FIRST caller's arguments are used for the actual
 * call; joiners simply await its result. A settled call (resolved OR rejected) is never memoized:
 * the very next call after it settles always re-runs `fn`, so a failed setup attempt (no JDK,
 * offline) retries on the next request instead of being stuck returning the old failure forever.
 */
export function singleFlight<A extends unknown[], T>(fn: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  let inFlight: Promise<T> | undefined;
  return (...args: A): Promise<T> => {
    if (!inFlight) {
      inFlight = fn(...args).finally(() => {
        inFlight = undefined;
      });
    }
    return inFlight;
  };
}
