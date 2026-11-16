const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** Hex SHA-256, for keys that must not reveal what they were made from (an IP, mixed with a salt). */
export const sha256 = async (text: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

/** Hex HMAC-SHA-256 of `text` under `key`: without the key, nobody can rebuild it from a guess. */
export const hmacSha256 = async (key: string, text: string) => {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(text)));
};
