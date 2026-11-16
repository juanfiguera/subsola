import { describe, expect, it } from 'vitest';
import { lineCertainty } from './certainty';
import type { SurveyedMain } from '../sources/mains';

const main = (depthFt: number | null) => ({ depthFt }) as SurveyedMain;

describe('lineCertainty', () => {
  it('calls a mapped main with a recorded depth measured', () => {
    expect(lineCertainty({ surveyed: main(9) })).toBe('measured');
  });

  it('calls a mapped route at the standard depth estimated', () => {
    expect(lineCertainty({ surveyed: main(null) })).toBe('estimated');
  });

  it('calls everything placed from permits or inferred estimated', () => {
    expect(lineCertainty({})).toBe('estimated');
  });
});
