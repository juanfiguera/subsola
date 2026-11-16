export type SourceStatus =
  { state: 'loading' } | { state: 'ok'; count: number } | { state: 'error'; message: string };
