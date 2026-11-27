import { describe, expect, it } from 'vitest';
import { isInAppBrowser } from './device';

const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
const GOOGLE_APP =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/350.0.701233025 Mobile/15E148 Safari/604.1';
const INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,3; iOS 18_1; en_US)';
const FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/490.0.0.40.107;FBBV/662]';

describe('isInAppBrowser', () => {
  it('spots the Google app and social apps', () => {
    expect(isInAppBrowser(GOOGLE_APP)).toBe(true);
    expect(isInAppBrowser(FACEBOOK)).toBe(true);
  });

  it('leaves Safari and Chrome alone', () => {
    expect(isInAppBrowser(SAFARI)).toBe(false);
    expect(isInAppBrowser(CHROME)).toBe(false);
  });

  it('spots Instagram, which writes its name without a slash', () => {
    expect(isInAppBrowser(INSTAGRAM)).toBe(true);
  });
});
