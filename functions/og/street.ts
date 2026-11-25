import { z } from 'zod';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import { regionAt } from '../../src/regions';
import { streetName } from '../../src/ui/dom';
import { cellsUrlFor, indexCacheFor } from '../../server/mcp/lookup';
import { streetLine } from '../../server/share/meta';
import { loadPlan, nearestStreetName, streetIsNear } from '../../server/og/plan';
import { streetPreviewSvg } from '../../server/og/draw';

// Workers forbid eval; without this zod tries new Function once to find out.
z.config({ jitless: true });

/**
 * /og/street?at=<lat>,<lng>&q=<street>: the preview picture for a shared street, a plan of the
 * block with its utility lines beside the address (server/og/draw.ts). The share page's tags
 * point here (server/share/meta.ts). Each picture is drawn once per data center per day and
 * then served from the edge cache; anything that goes wrong serves the site's own picture.
 */

interface Env {
  ASSETS: { fetch: (request: Request | string) => Promise<Response> };
  /** Where the cells are; unset, the public bucket. */
  CELLS_URL?: string;
}

interface Context {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
}

// A day: the cells are rebuilt each night, and a street rarely changes between builds.
const CACHE_SECONDS = 86_400;
// Long enough to stop a burst of retries, short enough that a fixed fault clears soon.
const FALLBACK_SECONDS = 600;

let ready: Promise<void> | null = null;
const startRenderer = () => {
  ready ??= initWasm(resvgWasm).catch((error: unknown) => {
    ready = null;
    throw error;
  });
  return ready;
};

let fonts: Promise<Uint8Array[]> | null = null;
const loadFonts = (env: Env, origin: string) => {
  fonts ??= Promise.all(
    ['/fonts/Barlow-SemiBold.ttf', '/fonts/BarlowCondensed-ExtraBold.ttf'].map(async (path) => {
      const res = await env.ASSETS.fetch(new Request(new URL(path, origin)));
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    }),
  ).catch((error: unknown) => {
    fonts = null;
    throw error;
  });
  return fonts;
};

const atSchema = z
  .tuple([
    z.coerce.number().finite().min(-90).max(90),
    z.coerce.number().finite().min(-180).max(180),
  ])
  .transform(([lat, lng]): [number, number] => [lng, lat]);

const fallback = async (env: Env, origin: string) => {
  const res = await env.ASSETS.fetch(new Request(new URL('/og.png', origin)));
  const headers = new Headers({
    'Content-Type': 'image/png',
    'Cache-Control': `public, max-age=${FALLBACK_SECONDS}`,
  });
  return new Response(res.body, { status: res.ok ? 200 : 502, headers });
};

const preview = async ({ request, env, waitUntil }: Context) => {
  const url = new URL(request.url);
  const cellsUrl = cellsUrlFor(env.CELLS_URL, request.url);
  const at = atSchema.safeParse(url.searchParams.get('at')?.split(',') ?? []);
  const typed = streetLine(url.searchParams.get('q') ?? '');
  const lngLat = at.success ? at.data : null;
  const region = lngLat ? regionAt(lngLat) : null;
  if (!lngLat || !region) return fallback(env, url.origin);

  // Keyed on the parsed values, so stray parameters can't fill the cache with copies.
  const key = new Request(
    `${url.origin}/og/street?at=${lngLat[1].toFixed(5)},${lngLat[0].toFixed(5)}&q=${encodeURIComponent(typed ?? '')}`,
  );
  const cache = caches.default;
  const cached = await cache.match(key);
  if (cached) return cached;

  try {
    const started = Date.now();
    const [loaded, fontBuffers] = await Promise.all([
      loadPlan(lngLat, region, { cellsUrl, cellIndex: indexCacheFor(cellsUrl) }),
      loadFonts(env, url.origin),
      startRenderer(),
    ]);
    if (!loaded) return fallback(env, url.origin);
    const typedStreet = typed?.replace(/^\d+[A-Za-z]?(-\d+)?\s+/, '') ?? '';
    // The typed address only if the city's own streets agree it's here; else the street's name.
    const street =
      typed && typedStreet && streetIsNear(typedStreet, loaded.streets, loaded.frame)
        ? typed
        : streetName(nearestStreetName(loaded.streets, loaded.frame) ?? '') || region.name;
    const svg = streetPreviewSvg(
      { street, city: region.name, beta: Boolean(region.beta) },
      loaded.plan,
      loaded.facts,
    );
    const resvg = new Resvg(svg, {
      font: { fontBuffers, defaultFontFamily: 'Barlow', loadSystemFonts: false },
    });
    const rendered = resvg.render();
    const png = rendered.asPng();
    // Wasm memory isn't collected; an isolate draws many pictures.
    rendered.free();
    resvg.free();
    console.info(
      `[subsola og] ${region.short} ${png.byteLength} bytes in ${Date.now() - started} ms`,
    );
    const response = new Response(png.slice().buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
    waitUntil(cache.put(key, response.clone()));
    return response;
  } catch (error) {
    console.error('[subsola og] preview failed', String(error));
    return fallback(env, url.origin);
  }
};

// Some link unfurlers ask with HEAD before they fetch; the runtime drops the body for them.
export const onRequest = (context: Context) =>
  context.request.method === 'GET' || context.request.method === 'HEAD'
    ? preview(context)
    : new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
