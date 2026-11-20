import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AwsClient } from 'aws4fetch';
import { parseListing } from '../r2';

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Network errors, timeouts and 5xx are retried; anything else is a real answer and isn't. */
export const retrying = async (label: string, attempt: () => Promise<Response>) => {
  for (let tries = 0; ; tries++) {
    const delay = RETRY_DELAYS_MS[tries];
    let reason: string;
    try {
      const res = await attempt();
      if (res.ok || (res.status < 500 && res.status !== 429)) return res;
      reason = `HTTP ${res.status}`;
    } catch (error) {
      if (!(error instanceof TypeError) && !(error instanceof DOMException)) throw error;
      reason = error.message;
    }
    if (delay === undefined) throw new Error(`Gave up on ${label} (${reason})`);
    console.warn(`  retrying ${label} in ${delay / 1000}s after ${reason}`);
    await sleep(delay);
  }
};

/** Where an archive lives: R2 in the nightly, a folder when trying it out. */
export interface Store {
  /** The object's bytes, or null when there is no such object. */
  read: (key: string) => Promise<Uint8Array | null>;
  write: (key: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  list: (prefix: string) => Promise<string[]>;
  remove: (key: string) => Promise<void>;
}

export interface R2Credentials {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

export const r2Store = (env: R2Credentials, bucket: string, cacheControl?: string): Store => {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  const bucketUrl = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}`;
  const send = async (url: string, init: RequestInit = {}) => {
    const res = await retrying(`R2 ${init.method ?? 'GET'}`, () => client.fetch(url, init));
    if (!res.ok && res.status !== 404)
      throw new Error(`R2 ${init.method ?? 'GET'} ${url}: HTTP ${res.status}`);
    return res;
  };
  return {
    read: async (key) => {
      const res = await send(`${bucketUrl}/${key}`);
      return res.status === 404 ? null : new Uint8Array(await res.arrayBuffer());
    },
    write: async (key, bytes, contentType) => {
      await send(`${bucketUrl}/${key}`, {
        method: 'PUT',
        body: new Uint8Array(bytes),
        headers: {
          'Content-Type': contentType,
          ...(cacheControl && { 'Cache-Control': cacheControl }),
        },
      });
    },
    list: async (prefix) => {
      const keys: string[] = [];
      for (let token: string | undefined, first = true; first || token; first = false) {
        const query = new URLSearchParams({ 'list-type': '2', prefix });
        if (token) query.set('continuation-token', token);
        const page = parseListing(await (await send(`${bucketUrl}?${query}`)).text());
        keys.push(...page.objects.map(({ key }) => key));
        token = page.next;
      }
      return keys;
    },
    remove: async (key) => {
      await send(`${bucketUrl}/${key}`, { method: 'DELETE' });
    },
  };
};

export const folderStore = (root: string): Store => ({
  read: async (key) => {
    try {
      return await readFile(join(root, key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  },
  write: async (key, bytes) => {
    await mkdir(dirname(join(root, key)), { recursive: true });
    await writeFile(join(root, key), bytes);
  },
  list: async (prefix) => {
    try {
      return (await readdir(join(root, prefix))).map((name) => `${prefix}${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  },
  remove: (key) => rm(join(root, key), { force: true }),
});

/** The folder after `--out`, or undefined when the script should write to R2. */
export const outFolder = (argv: readonly string[]) => {
  const index = argv.indexOf('--out');
  if (index === -1) return undefined;
  const folder = argv[index + 1];
  if (!folder) throw new Error('--out needs a folder');
  return folder;
};
