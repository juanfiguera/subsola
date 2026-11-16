import { captureConsoleIntegration, captureException, init } from '@sentry/browser';
import { withoutQuery, withoutQuoted } from './errors';

/**
 * The Sentry setup itself, in its own module so it loads after the app (see errors.ts) and the
 * bundler still drops the parts of the SDK it doesn't use. `early` is what went wrong before it
 * arrived.
 */
export const startSentry = (dsn: string, early: unknown[]) => {
  init({
    dsn,
    // Errors only: no performance tracing or session replay. The SDK leaves out IPs and cookies
    // by default.
    tracesSampleRate: 0,
    integrations: [captureConsoleIntegration({ levels: ['error'] })],
    // An aborted request is the user moving on, not a fault.
    ignoreErrors: ['AbortError'],
    // A searched address is personal: page URLs carry it in the query, geocoder requests in
    // theirs, and some messages quote it. All of that is cut before an event leaves.
    beforeSend: (event) => {
      if (event.request?.url) event.request.url = withoutQuery(event.request.url);
      if (event.request) delete event.request.query_string;
      if (event.message) event.message = withoutQuoted(event.message);
      for (const exception of event.exception?.values ?? [])
        if (exception.value) exception.value = withoutQuoted(exception.value);
      return event;
    },
    beforeBreadcrumb: (breadcrumb) => {
      const data = breadcrumb.data as { url?: unknown; from?: unknown; to?: unknown } | undefined;
      for (const key of ['url', 'from', 'to'] as const)
        if (data && typeof data[key] === 'string') data[key] = withoutQuery(data[key]);
      if (breadcrumb.message) breadcrumb.message = withoutQuoted(breadcrumb.message);
      return breadcrumb;
    },
  });
  for (const error of early) captureException(error);
};
