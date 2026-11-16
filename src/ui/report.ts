import type { LotReport, MainOutFront } from '../report';
import { lotLineNote } from '../frontage';
import { CITY_CREDITS, linkCredit, NOT_ENDORSED, OSM_CREDIT } from '../attribution';
import { lotName, type Region } from '../regions';
import type { PermitRecord } from '../sources/permits';
import { permitDateText } from '../sources/permitDay';
import { houseSewerStatus } from '../sources/connections';
import { laHouseSewerText } from '../houseSewerText';
import { isPaused, PAUSED_SOURCES, SOURCES, type SourceKey } from '../sources/catalog';
import { CURB_VALVE_FROM_CURB_M } from '../scene/services';
import { depthStandards, FEET_TO_METERS, describeDepth, formatFeet } from '../depth';
import { RECYCLED_WATER, UTILITY_STYLES } from '../utilities';
import { isRecycled, isStormDrain, type SurveyedMain } from '../sources/mains';
import { escapeHtml, ownerName, titleCase } from './dom';
import {
  CURB_VALVE_FAQ,
  houseSewerSummary,
  mainKind,
  permitSources,
  plural,
  sourceLink,
} from './cards';
import {
  DC_SERVICE_NOTE,
  DC_SERVICE_SUMMARY,
  CHI_NO_HOUSE_SEWER,
  CHI_NO_SERVICE,
  DEN_NO_SERVICE,
  denServiceText,
  serviceNeedsAction,
  SERVICE_MATERIAL_LABELS,
  dcServiceFacts,
  SD_SERVICE_NOTE,
  SD_SERVICE_SUMMARY,
  SEA_NO_SERVICE,
  seaSideSewerText,
  SERVICE_SUMMARY,
  serviceBasis,
  serviceLabel,
  sidedServiceText,
} from '../serviceText';

export interface ReportHeading {
  address: string;
  neighborhood: string;
  /** Long date the records were read, e.g. "October 25, 2026". */
  readOn: string;
  /** A shared link back to this street, printed so a paper copy leads to the live map. */
  link: string;
  region: Region;
}

const feet = (meters: number) => `${Math.round(meters / FEET_TO_METERS)} ft`;

const facts = (rows: [string, string][]) =>
  `<dl class="report-facts">${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`;

const swatch = (color: string) =>
  `<span class="report-swatch" style="--accent:${color}" aria-hidden="true"></span>`;

/** A city's service line inventory held back for its terms (PAUSED_SOURCES), or null when shown. */
const pausedWaterBlock = (key: SourceKey) => {
  const paused = PAUSED_SOURCES[key];
  if (!paused) return null;
  return `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3>
      <p class="report-verdict">Not shown</p>
      <p>${escapeHtml(paused.owner[0]!.toUpperCase() + paused.owner.slice(1))} publishes this lot's service line record, but its terms don't allow republishing it, so Subsola has paused it while asking for permission. Look the address up on <a href="${escapeHtml(paused.lookup)}" target="_blank" rel="noopener">${escapeHtml(paused.owner)}'s own map</a>.</p>
    </div>`;
};

const dcWaterBlock = (report: LotReport) => {
  const lot = report.water?.lot;
  if (!lot?.sides)
    return `<div class="report-line"><h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3><p>DC Water's service line inventory has no entry for this lot.</p></div>`;
  const needsAction = lot.material === 'lead' || lot.material === 'galvanized';
  return `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3>
      <p class="report-verdict${needsAction ? ' report-verdict-warn' : ''}">${escapeHtml(SERVICE_MATERIAL_LABELS[lot.material])}</p>
      <p>${DC_SERVICE_SUMMARY[lot.material]}</p>
      ${facts([...dcServiceFacts(lot.sides), ['Size and route', 'Not published']])}
      <p class="report-note">${DC_SERVICE_NOTE}</p>
    </div>`;
};

const sfWaterBlock = () => `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3>
      <p class="report-verdict">Not published by lot</p>
      <p>SFPUC publishes service line material only for the few hundred addresses where it still has lines to replace, not for every lot, so none is drawn here.</p>
    </div>`;

const sfSewerBlock = (report: LotReport) => {
  const side = report.sideSewer;
  if (!side)
    return `<div class="report-line"><h3>${swatch(UTILITY_STYLES.sewer.color)}House sewer</h3><p class="report-verdict">Not on record</p><p>San Francisco's side sewer records have no entry under this address. Nearly every building in the city drains to the public sewer.</p></div>`;
  return `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.sewer.color)}House sewer</h3>
      <p class="report-verdict">On record</p>
      <p>The city records this building's side sewer and its route to the sewer in the street, as drawn on the map. The property owner owns and maintains it.</p>
      ${facts([
        ['Size', side.diameterIn ? `${side.diameterIn} in` : 'Not recorded'],
        ['Material', side.material ?? 'Not recorded'],
        ['Depth', 'Not recorded'],
      ])}
    </div>`;
};

const laWaterBlock = () => `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3>
      <p class="report-verdict">Not published</p>
      <p>LADWP does not publish its service lines by lot. It reports finding no lead or galvanized service lines that need replacing.</p>
    </div>`;

const laSewerBlock = (report: LotReport) => {
  const { status, detail } = laHouseSewerText(report.nearbySideSewer);
  return `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.sewer.color)}House sewer</h3>
      <p class="report-verdict">${escapeHtml(status)}</p>
      <p>${escapeHtml(detail)}</p>
    </div>`;
};

const sdWaterBlock = (report: LotReport) => {
  const lot = report.water?.lot;
  if (!lot?.sides)
    return `<div class="report-line"><h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3><p>The city's service line inventory has no entry for this address that Subsola could draw. It lists about 281,000 services with a location, and no lead ones.</p></div>`;
  const needsAction = lot.material === 'lead' || lot.material === 'galvanized';
  return `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3>
      <p class="report-verdict${needsAction ? ' report-verdict-warn' : ''}">${escapeHtml(SERVICE_MATERIAL_LABELS[lot.material])}</p>
      <p>${SD_SERVICE_SUMMARY[lot.material]}</p>
      ${facts([...dcServiceFacts(lot.sides), ['Size and route', 'Not published']])}
      <p class="report-note">${SD_SERVICE_NOTE}</p>
    </div>`;
};

const sdSewerBlock = () => `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.sewer.color)}House sewer</h3>
      <p class="report-verdict">Not published</p>
      <p>The city doesn't publish its house laterals. Its design guide puts them 5 to 7 ft below the top of the curb at the property line.</p>
    </div>`;

const seaWaterBlock = (report: LotReport) => {
  const lot = report.water?.lot;
  if (!lot?.sides)
    return `<div class="report-line"><h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3><p>${SEA_NO_SERVICE}</p></div>`;
  const { summary, note, facts: rows } = sidedServiceText({ ...lot, sides: lot.sides });
  const needsAction = lot.material === 'lead' || lot.material === 'galvanized';
  return `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3>
      <p class="report-verdict${needsAction ? ' report-verdict-warn' : ''}">${escapeHtml(serviceLabel(lot))}</p>
      <p>${summary}</p>
      ${facts(rows)}
      <p class="report-note">${note}</p>
    </div>`;
};

const seaSewerBlock = (report: LotReport) => {
  const { status, detail, facts: rows } = seaSideSewerText(report.sideSewer);
  return `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.sewer.color)}Side sewer</h3>
      <p class="report-verdict">${escapeHtml(status)}</p>
      <p>${escapeHtml(detail)}</p>
      ${rows.length ? facts(rows) : ''}
    </div>`;
};

const denWaterBlock = (report: LotReport) => {
  const lot = report.water?.lot;
  if (lot?.source !== 'denServiceLines')
    return `<div class="report-line"><h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3><p>${DEN_NO_SERVICE}</p></div>`;
  const { summary, note, facts: rows } = denServiceText(lot);
  return `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3>
      <p class="report-verdict${serviceNeedsAction(lot) ? ' report-verdict-warn' : ''}">${escapeHtml(serviceLabel(lot))}</p>
      <p>${summary}</p>
      ${facts([...rows, ['Size and route', 'Not published']])}
      <p class="report-note">${note}</p>
    </div>`;
};

const denSewerBlock = () => `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.sewer.color)}House sewer</h3>
      <p class="report-verdict">Not published</p>
      <p>Denver doesn't publish its house sewers. The building's owner owns the line all the way to the main, and the city designs its sewers deep enough to take a house sewer from the basement.</p>
    </div>`;

const chiWaterBlock = () => `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3>
      <p class="report-verdict">Not published</p>
      <p>${CHI_NO_SERVICE}</p>
    </div>`;

const chiSewerBlock = () => `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.sewer.color)}House sewer</h3>
      <p class="report-verdict">Not published</p>
      <p>${CHI_NO_HOUSE_SEWER}</p>
    </div>`;

const dcSewerBlock = () => `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.sewer.color)}House sewer</h3>
      <p class="report-verdict">Not published</p>
      <p>DC publishes no records of house sewer connections, so none is drawn. Nearly every DC building drains to the public sewer.</p>
    </div>`;

const waterBlock = (report: LotReport) => {
  const line = report.water;
  if (!line)
    return `<div class="report-line"><h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3><p>DEP's lead service line inventory has no entry for this lot. Vacant lots, parks and some city property are not included.</p></div>`;
  const { lot } = line;
  const needsAction = lot.material === 'lead' || lot.material === 'galvanized';
  return `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.water.color)}Water service</h3>
      <p class="report-verdict${needsAction ? ' report-verdict-warn' : ''}">${escapeHtml(SERVICE_MATERIAL_LABELS[lot.material])}</p>
      <p>${SERVICE_SUMMARY[lot.material]}${needsAction ? ' DEP provides free lead test kits for tap water through 311.' : ''}</p>
      ${facts([
        ['How DEP knows', serviceBasis(lot.basis)],
        ['Size and route', 'Not published'],
        [
          'Curb valve',
          line.curbValve
            ? 'Required in the sidewalk 18 in from the curb'
            : 'Required 18 in from the curb; no mapped curb at this location',
        ],
        ...(lot.cityOwned ? [['Lot owner', 'City of New York'] as [string, string]] : []),
      ])}
    </div>`;
};

const sewerBlock = (report: LotReport) => {
  const status = houseSewerStatus(report.connectionPermits);
  const label =
    status.kind === 'assumed' ? 'Inferred' : status.kind === 'plugged' ? 'Plugged' : 'On record';
  return `
    <div class="report-line">
      <h3>${swatch(UTILITY_STYLES.sewer.color)}House sewer</h3>
      <p class="report-verdict">${label}</p>
      <p>${houseSewerSummary(report.connectionPermits).long}</p>
      ${facts([
        ['Size', "6 or 8 in under DEP's standard; this lot's is not published"],
        ['Route', 'Not published'],
      ])}
    </div>`;
};

const connectionTable = (report: LotReport) =>
  report.connectionPermits.length
    ? `<table class="report-table">
        <caption>DEP connection permits for this lot</caption>
        <thead><tr><th>Date</th><th>Work</th><th>Permit</th></tr></thead>
        <tbody>${report.connectionPermits
          .map(
            (p) =>
              `<tr><td>${escapeHtml(p.date)}</td><td>${escapeHtml(`${UTILITY_STYLES[p.utility].label} ${p.action.toLowerCase()}`)}</td><td>${escapeHtml(p.permitNumber)}</td></tr>`,
          )
          .join('')}</tbody>
      </table>`
    : '<p class="report-note">No DEP water or sewer connection permits for this lot since 2018, when published records begin.</p>';

/** Where the curb is from the lot line, measured back from the curb valve DEP's rule places. */
const curbDistanceM = (report: LotReport) => {
  const line = report.water;
  if (!line?.curbValve) return null;
  return (
    Math.hypot(line.curbValve[0] - line.b[0], line.curbValve[1] - line.b[1]) +
    CURB_VALVE_FROM_CURB_M
  );
};

// The drawing: a cut through the street in front of the lot, lot line at left.
const SECTION = { width: 680, height: 300, left: 70, right: 24, top: 34, bottom: 40 };
// Average advance of the 12px semibold label face; generous, so estimates err toward a new row.
const LABEL_CHAR_PX = 6.6;

/**
 * A row for each centered label so none overlap: each takes the first row, top down, where it
 * clears the labels already there by `gap`. Rows come back in the labels' own order.
 */
export const labelRows = (labels: { x: number; width: number }[], gap = 10): number[] => {
  const rowEnds: number[] = [];
  const rows = new Array<number>(labels.length);
  const byLeft = labels
    .map((label, index) => ({
      left: label.x - label.width / 2,
      right: label.x + label.width / 2,
      index,
    }))
    .sort((a, b) => a.left - b.left);
  for (const { left, right, index } of byLeft) {
    let row = rowEnds.findIndex((end) => end + gap <= left);
    if (row === -1) row = rowEnds.push(right) - 1;
    else rowEnds[row] = right;
    rows[index] = row;
  }
  return rows;
};

/** Storm drains and recycled water are named apart from the sewer and water mains. */
const isOwnLine = (main: MainOutFront) => isStormDrain(main.surveyed) || isRecycled(main.surveyed);

/** What the report calls a line out front: its utility, a storm drain or recycled water. */
const mainLabel = (main: MainOutFront) =>
  main.surveyed && isOwnLine(main)
    ? mainKind(main.surveyed).replace(/ main$/, '')
    : UTILITY_STYLES[main.utility].label;

const mainColor = (main: MainOutFront) =>
  isRecycled(main.surveyed) ? RECYCLED_WATER.color : UTILITY_STYLES[main.utility].color;

const pipeLabel = (main: MainOutFront, shallowestFt: number) =>
  `${mainLabel(main)}, ${formatFeet(shallowestFt)}`;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface DotLabel {
  /** The dot's center and the label's estimated width. */
  x: number;
  y: number;
  width: number;
}

export interface PlacedLabel {
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

// How much of a box falls outside the plot.
const outside = (box: Box, plot: Box) =>
  (box.x1 - box.x0) * (box.y1 - box.y0) - overlapArea(box, plot);

// Right of the dot first, then left, then nudged up or down a line at a time.
const LABEL_SPOTS = [0, -12, 12, -24, 24].flatMap((dy) =>
  (['start', 'end'] as const).map((anchor) => ({ dy, anchor })),
);

/**
 * Where each dot's label goes so it clears the plot's edges, the other dots and labels, and,
 * where it can, the other pipes' depth bars. Each label takes the first spot that clears all of
 * them; failing that, the one crossing the fewest bars; failing that, the one overlapping least.
 */
export const placeDotLabels = (
  dots: DotLabel[],
  bars: { x: number; y0: number; y1: number }[],
  plot: Box,
): PlacedLabel[] => {
  const placed: Box[] = [];
  const dotBoxes = dots.map((dot) => ({
    x0: dot.x - 8,
    x1: dot.x + 8,
    y0: dot.y - 8,
    y1: dot.y + 8,
  }));
  return dots.map((dot) => {
    const options = LABEL_SPOTS.map(({ dy, anchor }) => {
      const x = anchor === 'start' ? dot.x + 12 : dot.x - 12;
      const baseline = dot.y + 4 + dy;
      const box = {
        x0: anchor === 'start' ? x : x - dot.width,
        x1: anchor === 'start' ? x + dot.width : x,
        y0: baseline - 11,
        y1: baseline + 3,
      };
      const clash =
        outside(box, plot) +
        [...placed, ...dotBoxes].reduce((sum, other) => sum + overlapArea(box, other), 0);
      const blocked = clash > 0;
      const crossings = bars.filter(
        (bar) =>
          bar.x !== dot.x &&
          bar.x > box.x0 - 2 &&
          bar.x < box.x1 + 2 &&
          bar.y0 < box.y1 &&
          box.y0 < bar.y1,
      ).length;
      return { label: { x, y: baseline, anchor }, box, blocked, clash, crossings };
    });
    const open = options.filter((option) => !option.blocked);
    const best =
      open.find((option) => option.crossings === 0) ??
      [...open].sort((a, b) => a.crossings - b.crossings)[0] ??
      [...options].sort((a, b) => a.clash - b.clash)[0]!;
    placed.push(best.box);
    return best.label;
  });
};

const sectionDrawing = (report: LotReport) => {
  const mains = report.mains;
  if (!mains.length) return '';
  const curb = curbDistanceM(report);
  const reachFt = Math.max(...mains.map((m) => m.distanceM), curb ?? 0) / FEET_TO_METERS + 6;
  const depthFt = 10;
  // The farthest pipe's label runs right of its dot, so the plot ends early enough to fit it.
  const farthest = mains.reduce((far, main) => (main.distanceM > far.distanceM ? main : far));
  const farthestLabel = depthStandards()[farthest.utility];
  const labelRoom =
    farthestLabel && farthestLabel.basis !== 'unknown'
      ? 12 + pipeLabel(farthest, farthestLabel.shallowestFt).length * LABEL_CHAR_PX
      : 0;
  const plotWidth = SECTION.width - SECTION.left - Math.max(SECTION.right, labelRoom);
  const plotHeight = SECTION.height - SECTION.top - SECTION.bottom;
  const x = (ft: number) => SECTION.left + (ft / reachFt) * plotWidth;
  const y = (ft: number) => SECTION.top + (Math.min(ft, depthFt) / depthFt) * plotHeight;
  const ftOf = (m: number) => m / FEET_TO_METERS;

  // No 0 ft label: the surface line and the lot sit there.
  const depthTicks = [2, 4, 6, 8, 10]
    .map(
      (ft) =>
        `<line class="grid" x1="${SECTION.left}" x2="${SECTION.width - SECTION.right}" y1="${y(ft)}" y2="${y(ft)}"/><text class="tick" x="${SECTION.left - 8}" y="${y(ft) + 4}" text-anchor="end">${ft} ft</text>`,
    )
    .join('');
  const step = reachFt > 60 ? 20 : 10;
  const distanceTicks = Array.from({ length: Math.floor(reachFt / step) + 1 }, (_, i) => i * step)
    .map(
      (ft) =>
        `<text class="tick" x="${x(ft)}" y="${SECTION.height - 14}" text-anchor="middle">${ft} ft</text>`,
    )
    .join('');

  const surface = `
    <rect class="lot" x="0" y="${SECTION.top - 22}" width="${SECTION.left}" height="22"/>
    <text class="place" x="${SECTION.left - 8}" y="${SECTION.top - 8}" text-anchor="end">Lot</text>
    <line class="surface" x1="${SECTION.left}" x2="${SECTION.width - SECTION.right}" y1="${SECTION.top}" y2="${SECTION.top}"/>
    <line class="lot-line" x1="${SECTION.left}" x2="${SECTION.left}" y1="${SECTION.top - 22}" y2="${SECTION.height - SECTION.bottom}"/>
    ${
      curb !== null
        ? `<line class="curb" x1="${x(ftOf(curb))}" x2="${x(ftOf(curb))}" y1="${SECTION.top - 10}" y2="${SECTION.top}"/>
           <text class="place" x="${(SECTION.left + x(ftOf(curb))) / 2}" y="${SECTION.top - 8}" text-anchor="middle">Sidewalk</text>
           <text class="place" x="${x(ftOf(curb)) + 8}" y="${SECTION.top - 8}">Street</text>`
        : `<text class="place" x="${SECTION.left + 8}" y="${SECTION.top - 8}">Sidewalk and street</text>`
    }`;

  // The lot's own lines run from the lot line out to their mains.
  const serviceLines = [report.water, report.sewer]
    .flatMap((line) => {
      // The lot's service taps its own utility's main, never a storm drain or recycled water.
      const main = line && mains.find((m) => m.utility === line.utility && !isOwnLine(m));
      if (!line || !main) return [];
      const depth = depthStandards()[line.utility]!.shallowestFt;
      return [
        `<line class="service" style="--accent:${UTILITY_STYLES[line.utility].color}" x1="${SECTION.left}" x2="${x(ftOf(main.distanceM))}" y1="${y(depth)}" y2="${y(depth)}"/>`,
      ];
    })
    .join('');

  const unknownText = (main: MainOutFront) => `${mainLabel(main)}, depth not published`;
  const unknowns = mains.filter((main) => depthStandards()[main.utility]?.basis === 'unknown');
  const plotRight = SECTION.width - SECTION.right;
  const unknownLabels = unknowns.map((main) => {
    const width = unknownText(main).length * LABEL_CHAR_PX;
    // Kept inside the plot, so a line near either edge doesn't push its label off the page.
    const center = Math.min(
      Math.max(x(ftOf(main.distanceM)), SECTION.left + width / 2),
      plotRight - width / 2,
    );
    return { x: center, width };
  });
  const rows = labelRows(unknownLabels);

  const known = mains.filter((main) => {
    const basis = depthStandards()[main.utility]?.basis;
    return basis !== undefined && basis !== 'unknown';
  });
  const placements = placeDotLabels(
    known.map((main) => {
      const standard = depthStandards()[main.utility]!;
      return {
        x: x(ftOf(main.distanceM)),
        y: y(standard.shallowestFt),
        width: pipeLabel(main, standard.shallowestFt).length * LABEL_CHAR_PX,
      };
    }),
    mains.flatMap((main) => {
      const standard = depthStandards()[main.utility];
      return standard
        ? [
            {
              x: x(ftOf(main.distanceM)),
              y0: y(standard.shallowestFt),
              y1: y(standard.deepestFt),
            },
          ]
        : [];
    }),
    {
      x0: SECTION.left + 4,
      x1: SECTION.width - 2,
      y0: SECTION.top + 4,
      y1: SECTION.height - SECTION.bottom,
    },
  );

  const pipes = mains
    .map((main) => {
      const standard = depthStandards()[main.utility];
      const color = mainColor(main);
      const cx = x(ftOf(main.distanceM));
      if (!standard) return '';
      if (standard.basis === 'unknown') {
        // Unpublished depth: the whole zone it could be in, not a point.
        const index = unknowns.indexOf(main);
        const labelY = y(standard.deepestFt) + 16 + rows[index]! * 14;
        return `<g style="--accent:${color}">
          <line class="range unknown" x1="${cx}" x2="${cx}" y1="${y(standard.shallowestFt)}" y2="${y(standard.deepestFt)}"/>
          <text class="pipe-label" x="${unknownLabels[index]!.x}" y="${labelY}" text-anchor="middle">${unknownText(main)}</text>
        </g>`;
      }
      const cy = y(standard.shallowestFt);
      const place = placements[known.indexOf(main)]!;
      return `<g style="--accent:${color}">
        <line class="range" x1="${cx}" x2="${cx}" y1="${cy}" y2="${y(standard.deepestFt)}"/>
        <circle class="pipe" cx="${cx}" cy="${cy}" r="7"/>
        <text class="pipe-label" x="${place.x}" y="${place.y}" text-anchor="${place.anchor}">${pipeLabel(main, standard.shallowestFt)}</text>
      </g>`;
    })
    .join('');

  return `
    <figure class="report-figure">
      <svg viewBox="0 0 ${SECTION.width} ${SECTION.height}" role="img" aria-labelledby="section-title">
        <title id="section-title">Cut through the street in front of the lot, showing each utility line by distance from the lot line and expected depth</title>
        ${depthTicks}${distanceTicks}${surface}${serviceLines}${pipes}
      </svg>
      <figcaption>Section view along the street. Dots mark the minimum depth under each utility's standard, and bars extend to the maximum; dashed bars indicate the owner does not publish depth. Distances reflect where each line is drawn on the map, not a survey.</figcaption>
    </figure>`;
};

// "City of San Diego Public Utilities'" rather than "Utilities's".
const possessive = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);

const mapOf = (main: SurveyedMain) =>
  isStormDrain(main)
    ? 'storm drains'
    : isRecycled(main)
      ? 'recycled water mains'
      : main.utility === 'sewer'
        ? 'sewers'
        : main.utility === 'electric'
          ? 'underground lines'
          : 'mains';

const placedBy = (main: MainOutFront) =>
  main.surveyed
    ? `${possessive(SOURCES[main.surveyed.source].publisher)} map of its ${mapOf(main.surveyed)}`
    : main.assumed
      ? 'Inferred, no permit on this block'
      : main.digSpots
        ? `Permit location notes (${plural(main.digSpots, 'excavation')})`
        : 'Standard offset';

const mainsTable = (report: LotReport) =>
  `<table class="report-table">
    <thead><tr><th>Utility</th><th>From lot line</th><th>Expected depth</th><th>Positioned from</th><th>Permits on this block</th><th>Main permittees</th></tr></thead>
    <tbody>${report.mains
      .map((main) => {
        const standard = depthStandards()[main.utility];
        const owners = [...new Set(main.permittees.map(ownerName))].slice(0, 2).join(', ');
        return `<tr>
          <td class="report-nowrap">${swatch(mainColor(main))}${mainLabel(main)}${main.surveyed?.diameterIn ? `, ${main.surveyed.diameterIn} in${isStormDrain(main.surveyed) ? '' : ' main'}` : ''}</td>
          <td>About ${feet(main.distanceM)}</td>
          <td>${main.surveyed?.depthFt ? `About ${formatFeet(main.surveyed.depthFt)} down, measured` : standard ? (standard.basis === 'unknown' ? 'Not published' : describeDepth(standard)) : ''}</td>
          <td>${placedBy(main)}</td>
          <td>${main.surveyed ? 'Not tracked separately' : main.assumed ? 'None on record' : main.digs}${main.firstYear ? ` (${main.firstYear === main.lastYear ? main.firstYear : `${main.firstYear} to ${main.lastYear}`})` : ''}</td>
          <td>${escapeHtml(main.surveyed ? SOURCES[main.surveyed.source].publisher : owners || 'Not recorded')}</td>
        </tr>`;
      })
      .join('')}</tbody>
  </table>`;

const workRow = (record: PermitRecord) =>
  `<tr><td>${escapeHtml(permitDateText(record))}</td><td>${swatch(UTILITY_STYLES[record.utility].color)}${escapeHtml(record.purpose ?? titleCase(record.type))}</td><td>${escapeHtml(ownerName(record.permittee))}</td></tr>`;

const workSection = (report: LotReport) => {
  if (!report.recent.length && !report.live.length) return '';
  const live = report.live.length
    ? `<p class="report-live">Open now: ${report.live
        .map(
          (r) =>
            `${escapeHtml(ownerName(r.permittee))}, ${UTILITY_STYLES[r.utility].label.toLowerCase()} work permitted until ${escapeHtml(r.workEnd ?? 'an unlisted date')}`,
        )
        .join('; ')}.</p>`
    : '';
  return `
    <section class="report-section">
      <h2>Recent excavation permits</h2>
      ${live}
      <table class="report-table">
        <thead><tr><th>Date</th><th>Work</th><th>By</th></tr></thead>
        <tbody>${report.recent.map(workRow).join('')}</tbody>
      </table>
      ${
        report.digSpots.length
          ? `<p class="report-note">${plural(report.digSpots.length, 'permit location note')} place an excavation within 130 ft of the lot line. Most recent: “${escapeHtml(report.digSpots[0]!.note)}” (${escapeHtml(report.digSpots[0]!.issued ?? 'undated')}).</p>`
          : ''
      }
    </section>`;
};

const FIXTURE_LABELS: Record<string, string> = {
  hydrant: 'Nearest fire hydrant',
  'catch-basin': 'Nearest catch basin',
  manhole: 'Nearest mapped manhole',
};

const nearbySection = (report: LotReport) =>
  report.fixtures.length
    ? `<section class="report-section">
        <h2>Nearby fixtures</h2>
        ${facts(report.fixtures.map((f) => [FIXTURE_LABELS[f.kind] ?? f.title, `${feet(f.distanceM)} from the lot line`]))}
      </section>`
    : '';

const nycSources = () =>
  `water service material from ${sourceLink(SOURCES.serviceLines.name, SOURCES.serviceLines.url)}, NYC DEP. Connection permits from ${permitSources()}, NYC DEP. Street opening permits from ${sourceLink(SOURCES.permitsCurrent.name, SOURCES.permitsCurrent.url)} and ${sourceLink(SOURCES.permitsHistoric.name, SOURCES.permitsHistoric.url)}, NYC DOT. Curb valve rule from ${sourceLink("DEP's curb valve FAQ", CURB_VALVE_FAQ)}.`;

const dcSources = () =>
  `${isPaused('dcServiceLines') ? '' : `water service material from ${sourceLink(SOURCES.dcServiceLines.name, SOURCES.dcServiceLines.url)}, DC Water. `}${isPaused('dcMains') ? '' : `Large water mains from ${sourceLink(SOURCES.dcMains.name, SOURCES.dcMains.url)}, DC Water. `}Lots from ${sourceLink(SOURCES.dcLots.name, SOURCES.dcLots.url)}. Excavation permits from ${sourceLink(SOURCES.dcPermits.name, SOURCES.dcPermits.url)}, DDOT. Blocks, curbs, hydrants and street assets from DC GIS (OCTO), CC BY 4.0.`;

const sfSources = () =>
  `excavation permits from ${sourceLink(SOURCES.sfPermits.name, SOURCES.sfPermits.url)}, SF Public Works. Streets, curbs and buildings from DataSF, PDDL. Sewers, side sewers and sewer structures from ${sourceLink(SOURCES.sfSewerMains.name, SOURCES.sfSewerMains.url)}, ${sourceLink(SOURCES.sfSideSewers.name, SOURCES.sfSideSewers.url)} and ${sourceLink(SOURCES.sfSewerNodes.name, SOURCES.sfSewerNodes.url)}, SF Public Works.`;

const laSources = () =>
  `excavation permits from ${sourceLink(SOURCES.laPermitsArchived.name, SOURCES.laPermitsArchived.url)}, LA Bureau of Engineering, with the utility read from the contact's email domain. Sewers, house connections and storm drains from ${sourceLink(SOURCES.laSewers.name, SOURCES.laSewers.url)}, ${sourceLink(SOURCES.laSideSewers.name, SOURCES.laSideSewers.url)} and ${sourceLink(SOURCES.laStormDrains.name, SOURCES.laStormDrains.url)}, LA Sanitation. Sidewalks from StreetsLA's ${sourceLink(SOURCES.laSidewalks.name, SOURCES.laSidewalks.url)}. Streets, buildings and street assets from the City of Los Angeles GeoHub.`;

const sdSources = () =>
  `right of way permits from ${sourceLink('Approvals for development projects', SOURCES.sdPermits.url)}, City of San Diego Development Services, with the utility read from the company named. Sewers, water mains and recycled water mains from ${sourceLink(SOURCES.sdSewers.name, SOURCES.sdSewers.url)}, ${sourceLink(SOURCES.sdWaterMains.name, SOURCES.sdWaterMains.url)} and ${sourceLink(SOURCES.sdRecycledMains.name, SOURCES.sdRecycledMains.url)}, City of San Diego Public Utilities, and storm drains from ${sourceLink(SOURCES.sdStormDrains.name, SOURCES.sdStormDrains.url)}, City of San Diego Stormwater, as published by SanGIS.${isPaused('sdServiceLines') ? '' : ` Water service material from the city's ${sourceLink(SOURCES.sdServiceLines.name, SOURCES.sdServiceLines.url)}.`} Streets and buildings derived from SanGIS data.`;

const seaSources = () =>
  `Street Use utility permits from ${sourceLink(SOURCES.seaPermits.name, SOURCES.seaPermits.url)}, SDOT, with the utility read from the company that held each permit. Sewers, side sewers, water mains and water services from ${sourceLink(SOURCES.seaSewers.name, SOURCES.seaSewers.url)}, ${sourceLink(SOURCES.seaSideSewers.name, SOURCES.seaSideSewers.url)}, ${sourceLink(SOURCES.seaWaterMains.name, SOURCES.seaWaterMains.url)} and ${sourceLink(SOURCES.seaServiceLines.name, SOURCES.seaServiceLines.url)}, Seattle Public Utilities. Underground electric lines and structures from ${sourceLink(SOURCES.seaElectricLines.name, SOURCES.seaElectricLines.url)} and ${sourceLink(SOURCES.seaElectricStructures.name, SOURCES.seaElectricStructures.url)}, Seattle City Light, generalized for public use. Streets, buildings and street assets from the City of Seattle's open data.`;

const denSources = () =>
  `street occupancy permits from ${sourceLink(SOURCES.denPermits.name, SOURCES.denPermits.url)}, Denver Department of Transportation and Infrastructure, with the utility read from the purpose and the company named. Sanitary sewers and storm drains from ${sourceLink(SOURCES.denSewers.name, SOURCES.denSewers.url)} and ${sourceLink(SOURCES.denStormDrains.name, SOURCES.denStormDrains.url)}, Denver Wastewater Management.${isPaused('denServiceLines') ? '' : ` Water service category from Denver Water's ${sourceLink(SOURCES.denServiceLines.name, SOURCES.denServiceLines.url)}.`} Streets, buildings and street assets from the City and County of Denver's open data, CC BY 3.0.`;

const chiSources = () =>
  `public way opening permits from ${sourceLink(SOURCES.chiPermits.name, SOURCES.chiPermits.url)}, Chicago Department of Transportation, with the utility read from the company named and words in the permit's description. Chicago publishes no map of its water mains, sewers or street assets, so every line here comes from permits. Streets and buildings from the City of Chicago data portal.`;

export const lotReportHtml = (report: LotReport, heading: ReportHeading) => {
  const lot = lotName(report.bbl, heading.region);
  const city = heading.region.id;
  return `
    <div class="report-bar">
      <button class="pill" data-action="close-report">Back to the map</button>
      <button class="pill pill-ink" data-action="print-report">Print or save as PDF</button>
    </div>
    <article class="report-page">
      <div class="report-watermark" aria-hidden="true"><span class="mark"></span><span>Subsola</span></div>
      <header class="report-head">
        <p class="report-kicker">Utility records for</p>
        <h1>${escapeHtml(heading.address)}</h1>
        <p class="report-meta">${escapeHtml([heading.neighborhood, lot].filter(Boolean).join('. '))}. Public records as of ${escapeHtml(heading.readOn)}.</p>
      </header>
      <p class="report-notice">Built from public records. This is not a utility locate. <a href="${heading.region.markout.url}" target="_blank" rel="noopener">Call 811</a> at least ${escapeHtml(heading.region.markout.notice)} before you dig.</p>

      <section class="report-section">
        <h2>Service lines to this lot</h2>
        ${
          city === 'dc'
            ? `<div class="report-lines">${pausedWaterBlock('dcServiceLines') ?? dcWaterBlock(report)}${dcSewerBlock()}</div>`
            : city === 'sf'
              ? `<div class="report-lines">${sfWaterBlock()}${sfSewerBlock(report)}</div>`
              : city === 'la'
                ? `<div class="report-lines">${laWaterBlock()}${laSewerBlock(report)}</div>`
                : city === 'sd'
                  ? `<div class="report-lines">${pausedWaterBlock('sdServiceLines') ?? sdWaterBlock(report)}${sdSewerBlock()}</div>`
                  : city === 'sea'
                    ? `<div class="report-lines">${seaWaterBlock(report)}${seaSewerBlock(report)}</div>`
                    : city === 'den'
                      ? `<div class="report-lines">${pausedWaterBlock('denServiceLines') ?? denWaterBlock(report)}${denSewerBlock()}</div>`
                      : city === 'chi'
                        ? `<div class="report-lines">${chiWaterBlock()}${chiSewerBlock()}</div>`
                        : `<div class="report-lines">${waterBlock(report)}${sewerBlock(report)}</div>${connectionTable(report)}`
        }
      </section>

      <section class="report-section">
        <h2>Utilities in the adjacent street</h2>
        ${lotLineNote(report.lotLine) ? `<p class="report-note">${escapeHtml(lotLineNote(report.lotLine)!)}</p>` : ''}
        ${
          report.mains.length
            ? `${sectionDrawing(report)}${mainsTable(report)}`
            : '<p>No utility excavation permits on record within 80 ft of this lot line. This does not mean the street is empty: a line that has not been excavated since records begin will not appear here.</p>'
        }
      </section>

      ${workSection(report)}
      ${nearbySection(report)}

      <section class="report-section">
        <h2>Limitations</h2>
        <ul class="report-list">
          <li>The exact position and size of each line. Utilities do not publish either.</li>
          <li>The actual depth of any line. Depths are based on installation standards; older lines may be shallower.</li>
          <li>Gas and electric service lines to the building. ${escapeHtml(heading.region.privateOwners)} do not publish them.</li>
          <li>Work performed without a street permit, or before the city's published permit records begin.</li>
        </ul>
      </section>

      <section class="report-section report-811">
        <h2>Before you dig</h2>
        <p>${escapeHtml(heading.region.markout.law)} requires a free markout request to ${escapeHtml(heading.region.markout.center)} at least ${escapeHtml(heading.region.markout.notice)} before any excavation, including on private property. Utilities then mark their lines on the ground. Private lines beyond the meter, such as yard lighting or irrigation, are the property owner's responsibility to locate.</p>
        <a class="call-811" href="${heading.region.markout.url}" target="_blank" rel="noopener">Request a free markout (811)</a>
        <p class="report-print-only">Dial 811 or request a markout at ${escapeHtml(new URL(heading.region.markout.url).host.replace(/^www\./, ''))}.</p>
      </section>

      <footer class="report-sources">
        <p>Sources: ${city === 'dc' ? dcSources() : city === 'sf' ? sfSources() : city === 'la' ? laSources() : city === 'sd' ? sdSources() : city === 'sea' ? seaSources() : city === 'den' ? denSources() : city === 'chi' ? chiSources() : nycSources()} Prepared by Subsola from public data only. This is not a utility locate. Call 811 before you dig.</p>
        <p>${linkCredit(CITY_CREDITS[city], escapeHtml)} ${linkCredit(OSM_CREDIT, escapeHtml)} ${escapeHtml(NOT_ENDORSED)} <a href="/credits#credits-${city}">All data credits</a></p>
        <p class="report-print-only">Live map of this street: <a href="${escapeHtml(heading.link)}">${escapeHtml(heading.link)}</a></p>
      </footer>
    </article>`;
};
