import { describe, expect, it } from 'vitest';
import {
  HEIGHT,
  WIDTH,
  escapeXml,
  fitStreet,
  inView,
  legendOf,
  shortDate,
  streetPreviewSvg,
  type StreetFacts,
  wrapWords,
  type PlanLine,
  type StreetPlan,
} from './draw';

const line = (
  utility: PlanLine['utility'],
  path: PlanLine['path'],
  recycled = false,
): PlanLine => ({
  utility,
  path,
  assumed: false,
  recycled,
});

const PLAN: StreetPlan = {
  lines: [
    line('water', [
      [-50, 4],
      [50, 4],
    ]),
    line('gas', [
      [-50, -3],
      [50, -3],
    ]),
    // Far off the map.
    line('steam', [
      [500, 500],
      [600, 500],
    ]),
  ],
  streets: [
    [
      [-90, 0],
      [90, 0],
    ],
  ],
  curbs: [],
  buildings: [
    [
      [10, 10],
      [30, 10],
      [30, 30],
      [10, 30],
    ],
  ],
};

describe('inView', () => {
  it('sees a line crossing the map even with both ends outside it', () => {
    expect(
      inView([
        [-500, 0],
        [500, 0],
      ]),
    ).toBe(true);
    expect(
      inView([
        [-500, 300],
        [500, 300],
      ]),
    ).toBe(false);
    expect(inView([[0, 0]])).toBe(true);
  });
});

describe('the address', () => {
  it('wraps by words', () => {
    expect(wrapWords('1 Dr Carlton B Goodlett Pl', 14)).toEqual(['1 Dr Carlton B', 'Goodlett Pl']);
  });

  it('gets smaller as it gets longer, never past two lines', () => {
    expect(fitStreet('117 West St')).toEqual({ size: 72, lines: ['117 West St'] });
    expect(fitStreet('1 Dr Carlton B Goodlett Pl')).toEqual({
      size: 60,
      lines: ['1 Dr Carlton B', 'Goodlett Pl'],
    });
    const long = fitStreet(
      '12345 Martin Luther King Junior Memorial Boulevard Northeast Extension',
    );
    expect(long.lines).toHaveLength(2);
    expect(long.lines[1]!.endsWith('…')).toBe(true);
  });
});

describe('legend', () => {
  it("lists only what's on the map, in the layer order", () => {
    expect(legendOf(PLAN.lines).map((item) => item.label)).toEqual(['Gas', 'Water']);
  });

  it('keeps recycled water apart from drinking water', () => {
    const labels = legendOf([
      line('water', [
        [0, 0],
        [10, 0],
      ]),
      line(
        'water',
        [
          [0, 5],
          [10, 5],
        ],
        true,
      ),
    ]).map((item) => item.label);
    expect(labels).toEqual(['Water', 'Recycled water']);
  });
});

const FACTS: StreetFacts = {
  permits: 4129,
  since: 1991,
  diggingNow: { count: 3, owner: 'Con Edison', utility: 'gas', until: '2026-12-31' },
};
const NONE: StreetFacts = { permits: 0, since: null, diggingNow: null };
const TODAY = new Date('2026-11-25T12:00:00Z');

describe('streetPreviewSvg', () => {
  it('draws the address, the city and the lines at the preview size', () => {
    const svg = streetPreviewSvg(
      { street: '117 West St', city: 'New York City', beta: false },
      PLAN,
      FACTS,
      TODAY,
    );
    expect(svg).toContain(`width="${WIDTH}" height="${HEIGHT}"`);
    expect(svg).toContain('>117 West St</text>');
    expect(svg).toContain('>New York City</text>');
    expect(svg).toContain('stroke="#1f6fd1"');
    expect(svg).not.toContain('#fde68a');
    expect(svg).not.toContain('BETA');
    expect(svg).toContain('Call 811 before you dig.');
  });

  it('leads with the digs within 500 ft and who is digging today', () => {
    const svg = streetPreviewSvg(
      { street: '117 West St', city: 'New York City', beta: false },
      PLAN,
      FACTS,
      TODAY,
    );
    expect(svg).toContain('>4,129</text>');
    expect(svg).toContain('>street permits within 500 ft</text>');
    expect(svg).toContain('>since 1991</text>');
    const city = streetPreviewSvg(
      { street: '117 West St', city: 'New York City', beta: false },
      PLAN,
      { ...FACTS, diggingNow: { ...FACTS.diggingNow!, owner: 'Judlau', utility: 'capital' } },
      TODAY,
    );
    expect(city).toContain('>Judlau, city street work, until\u00a0Dec\u00a031</text>');
    expect(svg).toContain('>Digging now</text>');
    expect(svg).toContain('>Con Edison, gas, until\u00a0Dec\u00a031</text>');
    expect(svg).toContain('>and 2 more within 500 ft</text>');
  });

  it('draws lines carried through without a record pale, never dashed', () => {
    const svg = streetPreviewSvg(
      { street: '117 West St', city: 'New York City', beta: false },
      { ...PLAN, lines: PLAN.lines.map((l) => ({ ...l, assumed: true })) },
      FACTS,
      TODAY,
    );
    expect(svg).not.toContain('stroke-dasharray');
    expect(svg).toContain('stroke-opacity="0.4"');
  });

  it('marks a beta city', () => {
    expect(
      streetPreviewSvg(
        { street: '33 E Bayaud Ave', city: 'Denver', beta: true },
        PLAN,
        FACTS,
        TODAY,
      ),
    ).toContain('BETA');
  });

  it('escapes the text it draws', () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
      '&#60;a href=&#34;x&#34;&#62;&#39;&#38;&#39;&#60;/a&#62;',
    );
    const svg = streetPreviewSvg(
      { street: '1 <script>', city: 'A & B', beta: false },
      PLAN,
      { ...FACTS, diggingNow: { ...FACTS.diggingNow!, owner: '<b>Co</b>' } },
      TODAY,
    );
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('A &#38; B');
  });

  it('says so when there are no digs on record nearby', () => {
    expect(
      streetPreviewSvg(
        { street: '1 Main St', city: 'Seattle', beta: false },
        { ...PLAN, lines: [] },
        NONE,
        TODAY,
      ),
    ).toContain('No utility digs on record');
  });
});

describe('shortDate', () => {
  it("drops this year's year and keeps another's", () => {
    expect(shortDate('2026-12-31', TODAY)).toBe('Dec 31');
    expect(shortDate('2027-04-16', TODAY)).toBe('Apr 16, 2027');
  });
});
