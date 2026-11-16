import { describe, expect, it } from 'vitest';
import { depthBasis, lineKindOf, searchSource, stripUrlQueries } from './analytics';

describe('searchSource', () => {
  it('tells a typed search, the city map, a shared link and the opening street apart', () => {
    expect(searchSource(false, undefined)).toBe('typed');
    expect(searchSource(true, undefined)).toBe('city map');
    expect(searchSource(false, { address: '117 West St, New York, NY' })).toBe('share link');
    expect(searchSource(false, { address: null })).toBe('default');
  });
});

describe('lineKindOf', () => {
  it('names the scene refs that are underground lines', () => {
    expect(lineKindOf('permit-3')).toBe('permit');
    expect(lineKindOf('main-12')).toBe('main');
    expect(lineKindOf('water-service-4')).toBe('service');
    expect(lineKindOf('sewer-service-0')).toBe('service');
    expect(lineKindOf('assumed-gas-2')).toBe('assumed');
    expect(lineKindOf('junction-water-1')).toBe('junction');
  });

  it('leaves out what is not a line', () => {
    expect(lineKindOf('asset-7')).toBeNull();
    expect(lineKindOf('dig-0')).toBeNull();
  });
});

describe('depthBasis', () => {
  it('counts only a main with a recorded depth as measured', () => {
    expect(depthBasis('main', 6.5)).toBe('measured');
    expect(depthBasis('main', null)).toBe('estimated');
    expect(depthBasis('permit', 6.5)).toBe('estimated');
  });
});

describe('stripUrlQueries', () => {
  it('drops the address from every URL in an event, keys included', () => {
    const event = {
      event: '$web_vitals',
      properties: {
        $current_url: 'https://subsola.com/?q=12+Main+St#card',
        $referrer: 'https://news.ycombinator.com/item?id=1',
        $pathname: '/',
        $web_vitals_LCP_event: { $current_url: 'https://subsola.com/?q=12+Main+St', value: 1800 },
        $heatmap_data: { 'https://subsola.com/?q=12+Main+St': [{ x: 1, y: 2 }] },
        list: ['https://subsola.com/insights?x=1', 'plain text?'],
        count: 3,
        nothing: null,
      },
      timestamp: new Date('2026-11-10T12:00:00Z'),
    };
    const stripped = stripUrlQueries(event) as typeof event;
    expect(stripped.timestamp).toBeInstanceOf(Date);
    expect(stripped).toEqual({
      event: '$web_vitals',
      properties: {
        $current_url: 'https://subsola.com/',
        $referrer: 'https://news.ycombinator.com/item',
        $pathname: '/',
        $web_vitals_LCP_event: { $current_url: 'https://subsola.com/', value: 1800 },
        $heatmap_data: { 'https://subsola.com/': [{ x: 1, y: 2 }] },
        list: ['https://subsola.com/insights', 'plain text?'],
        count: 3,
        nothing: null,
      },
      timestamp: new Date('2026-11-10T12:00:00Z'),
    });
  });
});
