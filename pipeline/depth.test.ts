import { describe, expect, it } from 'vitest';
import { plausibleDepth } from './depth';

describe('plausibleDepth', () => {
  it('rounds a real depth', () => expect(plausibleDepth(8.14)).toBe(8.1));
  it('drops missing, negative and impossible depths', () => {
    expect(plausibleDepth(null)).toBeNull();
    expect(plausibleDepth(-2)).toBeNull();
    expect(plausibleDepth(980_509)).toBeNull();
  });
});
