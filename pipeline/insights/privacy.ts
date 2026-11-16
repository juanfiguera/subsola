/**
 * insights.json is published for anyone to read, so a run that would put contact details in it
 * stops instead. The figures are counts, street segments and company names; an email address or a
 * phone number in any string means a free-text field leaked through.
 */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// Ten digits in the North American shape, with or without separators.
const PHONE = /(?:\(\d{3}\)\s?|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/;

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value))
    for (const [index, item] of value.entries()) yield* strings(item, `${path}[${index}]`);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      yield [`${path}.${key} (key)`, key];
      yield* strings(item, `${path}.${key}`);
    }
}

/** Paths of every string that looks like an email address or phone number. */
export const contactDetailsIn = (value: unknown): string[] =>
  [...strings(value, '$')]
    .filter(([, text]) => EMAIL.test(text) || PHONE.test(text))
    .map(([path]) => path);
