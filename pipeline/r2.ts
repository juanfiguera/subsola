/** Keys and ETags from one ListObjectsV2 page, plus the token for the next page if there is one. */
export const parseListing = (xml: string) => {
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, body]) => ({
    key: /<Key>([^<]*)<\/Key>/.exec(body!)?.[1] ?? '',
    etag: (/<ETag>([^<]*)<\/ETag>/.exec(body!)?.[1] ?? '').replace(/&quot;|"/g, ''),
  }));
  const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1];
  return { objects, next };
};

/**
 * Objects under this prefix are written by archive scripts (pipeline/archive), not the cell build,
 * and hold history the source no longer has, so the upload's clean-up never touches them.
 */
export const ARCHIVE_PREFIX = 'archive/';

/**
 * What to send and what to remove, given local checksums and the bucket's ETags. A single-part
 * upload's ETag is the MD5 of its bytes, which is all upload.ts makes. Keys in `keep` are never
 * removed: insights.json stays up from the last good night when tonight's run didn't make one.
 * Nor is anything under ARCHIVE_PREFIX.
 */
export const planUpload = (
  local: Map<string, string>,
  remote: Map<string, string>,
  keep: ReadonlySet<string> = new Set(),
) => ({
  send: [...local].filter(([key, hash]) => remote.get(key) !== hash).map(([key]) => key),
  remove: [...remote.keys()].filter(
    (key) => !local.has(key) && !keep.has(key) && !key.startsWith(ARCHIVE_PREFIX),
  ),
});
