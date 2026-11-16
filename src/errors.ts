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
  // off a phone's first load. Uncaught errors from the moment between are held and sent once it
  // arrives.
  const early: unknown[] = [];
  const holdError = (event: ErrorEvent) => early.push(event.error ?? event.message);
  const holdRejection = (event: PromiseRejectionEvent) => early.push(event.reason);
  window.addEventListener('error', holdError);
  window.addEventListener('unhandledrejection', holdRejection);
  void import('./sentry')
    .then(({ startSentry }) => {
      window.removeEventListener('error', holdError);
      window.removeEventListener('unhandledrejection', holdRejection);
      startSentry(dsn, early);
    })
    .catch((error: unknown) => console.info('[subsola] error reporting did not load', error));
};
