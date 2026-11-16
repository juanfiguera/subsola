/**
 * HTTP Basic auth against one password, for the owner's pages. Any user name is taken; only the
 * password is checked.
 */

const digest = async (text: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

/**
 * Compares SHA-256 digests byte by byte without stopping at the first difference, so neither how
 * long the check takes nor the lengths involved say how close a guess was.
 */
export const sameSecret = async (given: string, expected: string): Promise<boolean> => {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
};

/** The password in an Authorization header, or null when it isn't Basic auth. */
export const basicPassword = (header: string | null): string | null => {
  const encoded = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header ?? '')?.[1];
  if (!encoded) return null;
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)),
    );
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  return colon < 0 ? null : decoded.slice(colon + 1);
};

/** Whether the request carries the password. With no password configured, nobody gets in. */
export const authorized = async (
  header: string | null,
  password: string | undefined,
): Promise<boolean> => {
  if (!password) return false;
  const given = basicPassword(header);
  if (given === null) return false;
  return sameSecret(given, password);
};
