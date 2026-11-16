import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Lines held in memory before they go to disk; well under Node's default heap.
const FLUSH_CHARS = 64 * 1024 * 1024;

/**
 * Appends tagged JSON lines to one file per key. Writes are batched, since a citywide dataset
 * spreads over thousands of files and one write per row would take hours.
 */
export const createShardWriter = async (dir: string) => {
  await mkdir(dir, { recursive: true });
  let pending = new Map<string, string[]>();
  let pendingChars = 0;
  const written = new Set<string>();

  const flush = async () => {
    const batch = pending;
    pending = new Map();
    pendingChars = 0;
    for (const [key, lines] of batch) await appendFile(join(dir, key), lines.join(''));
  };

  return {
    async add(key: string, tag: string, value: unknown) {
      written.add(key);
      const line = `${tag}\t${JSON.stringify(value)}\n`;
      const lines = pending.get(key);
      if (lines) lines.push(line);
      else pending.set(key, [line]);
      pendingChars += line.length;
      if (pendingChars > FLUSH_CHARS) await flush();
    },
    flush,
    has: (key: string) => written.has(key),
  };
};
