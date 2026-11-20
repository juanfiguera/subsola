import { describe, expect, it } from 'vitest';
import { missedPlace } from './missedPlace';

describe('missedPlace', () => {
  it.each([
    ['1 Main St, Boston', 'Boston, MA'],
    ['1 Main St, Boston, MA', 'Boston, MA'],
    ['1 Main St, Boston MA 02108', 'Boston, MA'],
    ['1 Main St, Boston, Massachusetts', 'Boston, MA'],
    ['200 Broadway, Portland, OR 97205', 'Portland, OR'],
    ['200 Broadway, Portland', 'Portland'],
    ['1 Elm St, St. Louis, MO', 'St Louis, MO'],
    ['1 Elm St, Saint Louis', 'St Louis, MO'],
    ['1 Elm St, Oakland, CA', 'Oakland, CA'],
    ['1 Elm St, Smallville, KS', 'KS'],
    ['1 Elm St, Portland, CA', null],
  ])('%s names %s', (text, place) => {
    expect(missedPlace(text)).toBe(place);
  });

  it('never names a covered city, borough or state alone', () => {
    for (const text of [
      '350 5th Ave, New York, NY',
      '117 West St, Brooklyn',
      '1420 5th Ave, Seattle, WA',
      '100 Main St, NY',
      '6000 Hollywood Blvd, Hollywood, CA',
      '1 Elm St, Smallville, CA',
      '1 Elm St, Smallville, TX',
    ])
      expect(missedPlace(text), text).toBeNull();
  });

  it('never returns a street, a house number or free text', () => {
    for (const text of [
      '1 Main St',
      '1 Main St, Apt 4B, Springfield Gardens',
      '1 Main St, John Smith, call 617-555-0100',
      '22 Acacia Avenue, Narnia',
      'Main Street, Elm Street, Oak Street',
      '10 Downing St, London',
      'someone@example.com, Boston Harbor Hotel',
    ])
      expect(missedPlace(text), text).toBeNull();
  });

  it('only ever answers with a place from its own list', () => {
    const answers = [
      '1 Main St, Boston',
      '5 Elm St, Kansas City, KS',
      '12 Oak Ave, Somewhere, VT',
      '9 Pine Rd, Cambridge, MA',
    ].map(missedPlace);
    for (const answer of answers)
      expect(answer).toMatch(/^([A-Z][A-Za-z ]+, )?[A-Z]{2}$|^[A-Z][A-Za-z ]+$/);
    expect(answers.join(' ')).not.toMatch(/\d|Main|Elm|Oak|Pine|Somewhere/);
  });
});
