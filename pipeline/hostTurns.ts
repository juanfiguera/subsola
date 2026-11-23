// Since 2026-11-22 each of LA's map services answers "Unable to complete operation" to every
// query but one when two or more arrive together. Different services still run side by side.
const ONE_AT_A_TIME = new Set(['maps.lacity.org']);
const queues = new Map<string, Promise<unknown>>();

/** The service a query goes to, when its host takes one query per service at a time. */
export const sharedService = (url: string): string | undefined => {
  const { host, pathname } = new URL(url);
  if (!ONE_AT_A_TIME.has(host)) return undefined;
  const service = /^(.*?\/(?:MapServer|FeatureServer))/.exec(pathname)?.[1] ?? pathname;
  return host + service;
};

/** Runs a query now, or after the one before it to the same service if that service can't share. */
export const takeTurn = <T>(url: string, run: () => Promise<T>): Promise<T> => {
  const service = sharedService(url);
  if (!service) return run();
  const turn = (queues.get(service) ?? Promise.resolve()).then(run);
  // A failed query still frees the service for the next one.
  queues.set(
    service,
    turn.catch(() => undefined),
  );
  return turn;
};
