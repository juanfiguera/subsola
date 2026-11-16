import { z } from 'zod';
import { shareMeta, type ShareMeta } from '../server/share/meta';

// Workers forbid eval; without this zod tries new Function once to find out.
z.config({ jitless: true });

/**
 * The map's page at /. A shared street link (/?q=...) gets its own title, description and
 * preview picture, rewritten into the static index.html as it streams through; any other visit
 * gets the file untouched. Only "/" comes here: Pages sends every other path straight to its
 * static file, the other functions or the 404 page.
 */

interface Context {
  request: Request;
  next: () => Promise<Response>;
}

const setContent = (value: string) => ({
  element: (element: RewriterElement) => {
    element.setAttribute('content', value);
  },
});

const rewrite = (response: Response, meta: ShareMeta) => {
  const rewritten = new HTMLRewriter()
    .on('title', {
      element: (element) => {
        // Set as text, so the address can't turn into markup.
        element.setInnerContent(meta.title);
      },
    })
    .on('meta[name="description"]', setContent(meta.description))
    .on('meta[property="og:url"]', setContent(meta.url))
    .on('meta[property="og:title"]', setContent(meta.title))
    .on('meta[property="og:description"]', setContent(meta.description))
    .on('meta[property="og:image"]', setContent(meta.image))
    .on('meta[property="og:image:alt"]', setContent(meta.imageAlt))
    .transform(response);
  const headers = new Headers(rewritten.headers);
  // The body is no longer the file the validator describes.
  headers.delete('ETag');
  headers.delete('Content-Length');
  return new Response(rewritten.body, { status: rewritten.status, headers });
};

export const onRequest = async ({ request, next }: Context) => {
  const response = await next();
  const meta = request.method === 'GET' ? shareMeta(new URL(request.url).search) : null;
  if (!meta || !response.ok || !response.headers.get('Content-Type')?.includes('text/html'))
    return response;
  return rewrite(response, meta);
};
