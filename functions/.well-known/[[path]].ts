import { handleWellKnown } from '../../server/mcp/card';

/** /.well-known/*: the AI catalog, the site's own files there, and a 404 for everything else. */
export const onRequest = ({ request, next }: { request: Request; next: () => Promise<Response> }) =>
  handleWellKnown(request, next);
