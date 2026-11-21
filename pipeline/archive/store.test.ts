import { describe, expect, it, vi } from 'vitest';
import { privateBucketStore } from './store';

const credentials = { R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c' };

describe('privateBucketStore', () => {
  it('skips with a warning while the archive bucket is unset, as an empty CI secret arrives', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(privateBucketStore({ ...credentials, R2_ARCHIVE_BUCKET: '' }, 'nothing run')).toBeNull();
    expect(log).toHaveBeenCalledWith('::warning::R2_ARCHIVE_BUCKET is not set; nothing run');
    log.mockRestore();
  });

  it('refuses the public cells bucket, by name or by default', () => {
    expect(() =>
      privateBucketStore({ ...credentials, R2_BUCKET: 'cells', R2_ARCHIVE_BUCKET: 'cells' }, 'x'),
    ).toThrow(/public cells bucket/);
    expect(() =>
      privateBucketStore({ ...credentials, R2_ARCHIVE_BUCKET: 'backfill-cells' }, 'x'),
    ).toThrow(/public cells bucket/);
  });

  it('opens a separate bucket', () => {
    expect(
      privateBucketStore({ ...credentials, R2_ARCHIVE_BUCKET: 'subsola-archive' }, 'x'),
    ).not.toBeNull();
  });
});
