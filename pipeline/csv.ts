/**
 * Reads a CSV file as it streams in, for portals that publish a dataset only as one big file
 * (San Diego's permits run past 500 MB, too big to hold as one string). Quoted fields can hold
 * commas, doubled quotes and line breaks.
 */

/** Each record's fields, as the chunks arrive. */
export async function* csvRecords(chunks: AsyncIterable<string>): AsyncGenerator<string[]> {
  let field = '';
  let record: string[] = [];
  let quoted = false;
  // A quote inside a quoted field either ends it or, doubled, stands for one quote; which one
  // is only known from the next character, which can be in the next chunk.
  let quoteSeen = false;
  for await (const chunk of chunks) {
    for (const char of chunk) {
      if (quoted) {
        if (quoteSeen) {
          quoteSeen = false;
          if (char === '"') {
            field += '"';
            continue;
          }
          quoted = false;
        } else if (char === '"') {
          quoteSeen = true;
          continue;
        } else {
          field += char;
          continue;
        }
      }
      if (char === '"' && field === '') quoted = true;
      else if (char === ',') {
        record.push(field);
        field = '';
      } else if (char === '\n') {
        record.push(field);
        yield record;
        field = '';
        record = [];
      } else if (char !== '\r') field += char;
    }
  }
  if (field !== '' || record.length) {
    record.push(field);
    yield record;
  }
}

/** Each row as columns by the header's names; blank fields are left out, as a null would be. */
export async function* csvRows(
  chunks: AsyncIterable<string>,
): AsyncGenerator<Record<string, string>> {
  let header: string[] | null = null;
  for await (const record of csvRecords(chunks)) {
    if (!header) {
      // Strips a byte order mark, which some portals put before the first column's name.
      header = record.map((name, index) => (index === 0 ? name.replace(/^\uFEFF/, '') : name));
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((name, index) => {
      const value = record[index];
      if (value) row[name] = value;
    });
    yield row;
  }
}

/** Whether each column matches its pattern; a blank one is tested as empty text. */
export const csvRowMatches = (row: Record<string, string>, match: Record<string, RegExp>) =>
  Object.entries(match).every(([column, pattern]) => pattern.test(row[column] ?? ''));
