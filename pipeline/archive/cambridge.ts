import { z } from 'zod';
import { keepAllowed } from './massachusetts';
import { retrying } from './store';

/**
 * Cambridge's excavation permits (Department of Public Works), every permit since April 2019,
 * published under the PDDL. See docs/archive.md.
 */

export const CAMBRIDGE_DATASET = 'https://data.cambridgema.gov/resource/nuxx-d95m.json';

const cuts = (prefix: string, suffixes: readonly string[]) =>
  suffixes.map((suffix) => `${prefix}${suffix}`);
const STREET_CUTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const SIDEWALK_CUTS = ['one', 'two', 'three', 'four', 'five'];

/**
 * The only fields requested. Left out: applicant_name; the hoisting licence number, grade and
 * expiry, which identify the person operating the machine; contractor, the firm's city licence
 * number; on_behalf and attestat_date, about who filed; the FEMA descriptions, free text from the
 * applicant; other_utility, city_contract_name and the utility and water permit numbers, which
 * are free text too and hold names like "Pending with <person>"; location_flags and the computed
 * regions, which are derived from the point; parking sign counts. The three company fields pass
 * through the company check, and dig_safe_number is cut down to the ticket numbers in it.
 */
export const CAMBRIDGE_FIELDS = [
  'id',
  'full_address',
  'latitude',
  'longitude',
  'mbl',
  'status',
  'permit_type',
  'applicant_submit_date',
  'issue_date',
  'start_date',
  'end_date',
  'work_between_standard_hours',
  'company_name',
  'client_company_name',
  'work_performed_by_a',
  'subcontractor_company_name',
  'performing_utility_work',
  'utilities',
  'new_gas_main',
  'dig_safe_number',
  'viewpoint_id',
  'city_contract',
  'department_responsible_for',
  'work_performed_on_the_public',
  'work_performed_on_private',
  'public_roadway',
  'public_sidewalk',
  'public_sewer',
  'public_stormwater',
  'public_water',
  'public_utility_comm',
  'public_site_work',
  'private_roadway',
  'private_sidewalk',
  'private_sewer',
  'private_stormwater',
  'private_water',
  'private_utility_comm',
  'private_site_work',
  'approved_curb_cut',
  'cutting_the_street_and_or',
  'number_of_street_cuts',
  ...cuts('length_of_street_cut_', STREET_CUTS),
  ...cuts('width_of_street_cut_', STREET_CUTS),
  ...cuts('depth_of_street_cut_', STREET_CUTS),
  ...cuts('area_of_street_cut_', STREET_CUTS),
  'number_of_sidewalk_cuts',
  ...cuts('length_of_sidewalk_cut_', SIDEWALK_CUTS),
  ...cuts('width_of_sidewalk_cut_', SIDEWALK_CUTS),
  ...cuts('material_of_sidewalk_cut_', ['1', '2', '3', '4', '5']),
] as const;

// Dig Safe tickets are eleven digits, written with or without dashes as 2019-080-4804.
const DIG_SAFE_TICKET = /\b\d{4}-?\d{3}-?\d{4}\b/g;

/**
 * Only the ticket numbers from a dig_safe_number. The field is free text ("20230805643 Fulkerson
 * St/20230903823 Bent St", "99999999999 (Feeney Bros)"), and the words around a ticket can name
 * someone.
 */
export const digSafeTickets = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const tickets = value.match(DIG_SAFE_TICKET);
  return tickets ? tickets.join(' ') : null;
};

const PAGE_ROWS = 5_000;
const REQUEST_TIMEOUT_MS = 120_000;

const soql = async (params: Record<string, string>) => {
  const url = `${CAMBRIDGE_DATASET}?${new URLSearchParams(params)}`;
  // Socrata's app token works across its portals and lifts the shared rate limit.
  const token = process.env.SOCRATA_APP_TOKEN;
  const res = await retrying('Cambridge SODA', () =>
    fetch(url, {
      headers: token ? { 'X-App-Token': token } : {},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
  );
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return z.array(z.record(z.string(), z.unknown())).parse(await res.json());
};

const countRows = async () => {
  const [row] = await soql({ $select: 'count(*) AS n' });
  return Number(z.object({ n: z.string() }).parse(row).n);
};

/** Every permit, cut to the allowlist. Throws unless it got exactly the rows promised. */
export const fetchCambridge = async () => {
  const count = await countRows();
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < count; offset += PAGE_ROWS) {
    const page = await soql({
      $select: CAMBRIDGE_FIELDS.join(','),
      // Socrata's row id, since a page boundary on a column with ties can repeat or skip rows.
      $order: ':id',
      $limit: String(PAGE_ROWS),
      $offset: String(offset),
    });
    for (const source of page) {
      const row = keepAllowed(source, CAMBRIDGE_FIELDS);
      if ('dig_safe_number' in row) row.dig_safe_number = digSafeTickets(row.dig_safe_number);
      rows.push(row);
    }
    if (page.length === 0) break;
  }
  const after = await countRows();
  if (rows.length !== count || after !== count)
    throw new Error(`Cambridge: promised ${count} rows, sent ${rows.length}, now ${after}`);
  return rows;
};
