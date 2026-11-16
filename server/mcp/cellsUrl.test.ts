import { describe, expect, it } from 'vitest';
import { CELLS_URL, cellsUrlFor } from './lookup';

describe('cellsUrlFor', () => {
  it('uses the public bucket unless a deployment names its own cells', () => {
    expect(cellsUrlFor(undefined, 'https://subsola.com/mcp')).toBe(CELLS_URL);
    expect(cellsUrlFor('  ', 'https://subsola.com/mcp')).toBe(CELLS_URL);
    expect(cellsUrlFor('https://cells.example.org/', 'https://x.org/mcp')).toBe(
      'https://cells.example.org',
    );
  });

  it("reads a relative path against the request's own origin, as a self-hosted copy sets it", () => {
    expect(cellsUrlFor('/cells', 'http://localhost:8080/mcp')).toBe('http://localhost:8080/cells');
  });
});
