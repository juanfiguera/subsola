/**
 * Strips the sources paused for their terms (PAUSED_SOURCES) out of the cells recorded in the
 * visual tests' network captures, so the repo doesn't carry copies of records the site has
 * stopped republishing. The app drops them as cells load anyway, so screenshots don't change.
 *
 *   pnpm exec tsx tests/visual/scrubPaused.ts     needs zip and unzip
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { isPaused, type SourceKey } from '../../src/sources/catalog';

const CELL = /^https:\/\/data\.subsola\.com\/-?\d+_-?\d+\.json\.gz$/;
// As pipeline/build.ts writes them: no OS byte, so a scrub run twice gives the same bytes.
const GZIP_OS_BYTE = 9;
const GZIP_OS_UNKNOWN = 255;

type Row = { source?: SourceKey };

/** A cell without its paused rows; null when nothing in it was paused. */
export const scrubCell = (cell: Record<string, unknown>) => {
  let changed = false;
  const keep = (rows: unknown, fallback?: SourceKey) => {
    if (!Array.isArray(rows)) return rows;
    const kept = (rows as Row[]).filter((row) => !isPaused(row.source ?? fallback));
    if (kept.length !== rows.length) changed = true;
    return kept;
  };
  const scrubbed: Record<string, unknown> = {
    ...cell,
    serviceLines: keep(cell.serviceLines),
    // Older builds wrote DC Water's mains without a source.
    mains: keep(cell.mains, 'dcMains'),
    assets: keep(cell.assets),
  };
  if (
    isPaused('conEdStructures') &&
    Array.isArray(cell.conEdStructures) &&
    cell.conEdStructures.length
  ) {
    scrubbed.conEdStructures = [];
    changed = true;
  }
  for (const key of ['serviceLines', 'mains', 'assets'] as const)
    if (cell[key] === undefined) delete scrubbed[key];
  return changed ? scrubbed : null;
};

const scrubCapture = (zipPath: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'har-'));
  try {
    execFileSync('unzip', ['-q', zipPath, '-d', dir]);
    const harName = readdirSync(dir).find((name) => name.endsWith('.har'))!;
    const har = JSON.parse(readFileSync(join(dir, harName), 'utf8')) as {
      log: { entries: { request: { url: string }; response: { content: { _file?: string } } }[] };
    };
    let scrubbed = 0;
    for (const entry of har.log.entries) {
      const file = entry.response.content._file;
      if (!file || !CELL.test(entry.request.url)) continue;
      const path = join(dir, file);
      const cell = scrubCell(JSON.parse(gunzipSync(readFileSync(path)).toString()));
      if (!cell) continue;
      const body = gzipSync(JSON.stringify(cell));
      body[GZIP_OS_BYTE] = GZIP_OS_UNKNOWN;
      writeFileSync(path, body);
      scrubbed += 1;
    }
    if (scrubbed) {
      rmSync(zipPath);
      execFileSync('zip', ['-q', '-X', '-r', zipPath, '.'], { cwd: dir });
    }
    console.log(`${zipPath}: ${scrubbed} cells scrubbed`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const here = new URL('.', import.meta.url).pathname;
  for (const name of readdirSync(here).filter((file) => file.endsWith('.har.zip')))
    scrubCapture(join(here, name));
}
