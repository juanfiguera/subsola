const GZIP_MAGIC = [0x1f, 0x8b];

/**
 * A gzipped JSON file from the bucket. Bundles are stored gzipped and sent as is; a host that
 * sends them with Content-Encoding has unzipped them already, so plain JSON is read too.
 */
export const readGzipJson = async (res: Response): Promise<unknown> => {
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== GZIP_MAGIC[0] || bytes[1] !== GZIP_MAGIC[1])
    return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
};
