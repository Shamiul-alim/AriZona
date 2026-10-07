/**
 * Telling "there is nothing" apart from "we could not ask".
 *
 * Every catalogue page used to wrap its fetches in a fallback so one failing
 * rail could not take the whole page down. That is still right for one rail,
 * but it also made a total outage look like a successful render of an empty
 * catalogue — and a successful render is something Next will cache. A home page
 * regenerated while the API was unreachable was stored empty and then served to
 * everyone until the next revalidation happened to catch the API awake.
 *
 * So a failure that means "nothing answered" has to reach Next as a failure.
 * Next then keeps serving the last good copy instead of replacing it, and a
 * first-ever render shows the error boundary rather than a hollow page.
 */
export class BackendUnavailableError extends Error {
  constructor(readonly failures: unknown[]) {
    super('The catalogue is not reachable right now.');
    this.name = 'BackendUnavailableError';
  }
}

/**
 * Collects several independent fetches, remembering which ones failed.
 *
 * `settle` keeps the per-rail fallback; `assertAnythingLoaded` is what refuses
 * to let a render succeed when nothing did.
 */
export function createLoader() {
  const failures: unknown[] = [];
  let attempted = 0;

  return {
    /** One source, with a fallback for when only this one is unavailable. */
    async settle<T>(promise: Promise<T>, fallback: T): Promise<T> {
      attempted += 1;
      try {
        return await promise;
      } catch (error) {
        failures.push(error);
        return fallback;
      }
    },

    /**
     * Throws when every source failed.
     *
     * All of them failing is an outage rather than an empty catalogue: these
     * endpoints have nothing in common except the server answering them.
     */
    assertAnythingLoaded(): void {
      if (attempted > 0 && failures.length === attempted) {
        throw new BackendUnavailableError(failures);
      }
    },

    /** For logging: how much of the page is missing, without any response bodies. */
    get summary(): { attempted: number; failed: number } {
      return { attempted, failed: failures.length };
    },
  };
}
