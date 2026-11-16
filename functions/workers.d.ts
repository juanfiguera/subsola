/**
 * The few Workers runtime globals the functions use that the DOM types lack. The full set lives
 * in @cloudflare/workers-types, which would clash with the DOM types the shared code needs.
 */

interface RewriterElement {
  setAttribute: (name: string, value: string) => void;
  setInnerContent: (content: string) => void;
}

declare class HTMLRewriter {
  on(selector: string, handlers: { element?: (element: RewriterElement) => void }): HTMLRewriter;
  transform(response: Response): Response;
}

interface CacheStorage {
  /** The data center's cache, shared by every request there. */
  readonly default: Cache;
}

/** Wrangler bundles an imported .wasm file as a compiled module. */
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
