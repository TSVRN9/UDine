/**
 * Races a promise (or thenable, e.g. a Supabase PostgrestBuilder) against a timeout, so a hung
 * native call or stalled network request becomes an observable rejection instead of silence.
 *
 * Context (#45): a toggle handler awaited several network calls back-to-back with no timeout on
 * any of them. One stalled silently — no throw, no log, no crash — and because the *symptom*
 * (push token registration never completing) pointed at a later, unrelated call in the chain,
 * the actual hang went undiagnosed. Wrapping each await in the chain with this makes a hang show
 * up as a labeled, catchable error within a bounded time instead of running forever.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
