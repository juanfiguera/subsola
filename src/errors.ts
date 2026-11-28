/**
 * Production error reporting to Sentry. Most failures here are caught and logged with
 * console.error rather than thrown, so those logs are reported too, not only uncaught errors.
 * No DSN (local builds, previews) means nothing is sent.
 */
/** A URL without its query, where addresses travel. */
export const withoutQuery = (url: string) => url.split('?')[0]!;

/** A message without what it quotes: 'Couldn't find "12 Main St"' keeps the shape, not the address. */
export const withoutQuoted = (text: string) => text.replace(/"[^"]*"/g, '"…"');

export const startErrorReporting = (dsn: string | undefined) => {
  if (!dsn) return;
  // The SDK downloads beside the app instead of ahead of it, which keeps about 30 KB (compressed)
  // off a phone's first load. Uncaught errors and console.error logs from the moment between are
  // held and sent once it arrives. The logs matter most: the report of a load that died for
  // memory (crashes.ts) is logged at startup, before the SDK is here to see it.
  const early: unknown[] = [];
  const earlyLogs: string[] = [];
  const holdError = (event: ErrorEvent) => early.push(event.error ?? event.message);
  const holdRejection = (event: PromiseRejectionEvent) => early.push(event.reason);
  const consoleError = console.error;
  console.error = (...args: unknown[]) => {
    earlyLogs.push(args.map(String).join(' '));
    consoleError.apply(console, args);
  };
  window.addEventListener('error', holdError);
  window.addEventListener('unhandledrejection', holdRejection);
  void import('./sentry')
    .then(({ startSentry }) => {
      window.removeEventListener('error', holdError);
      window.removeEventListener('unhandledrejection', holdRejection);
      // Back to the original before the SDK wraps it, so later logs aren't held as well as sent.
      console.error = consoleError;
      startSentry(dsn, early, earlyLogs);
    })
    .catch((error: unknown) => console.info('[subsola] error reporting did not load', error));
};
