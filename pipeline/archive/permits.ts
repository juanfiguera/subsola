import { z } from 'zod';
import { contactDetailsIn } from '../insights/privacy';

/**
 * Toronto's utility cut permits, cut down to what places and classifies a dig. See docs/archive.md
 * for what is kept and why the rest is dropped.
 */

const text = z.string().nullable();

/** One datastore row. Every field is required, so a renamed column stops the run. */
export const sourceRowSchema = z.object({
  PERMIT_NUMBER: z.string().min(1),
  PROPOSED_FROM_DATE: text,
  PROPOSED_TO_DATE: text,
  CLIENT_NAME: text,
  GEO_ID: text,
  DISPLAY_DESC: text,
  PERMIT_STATUS: text,
  INSTALLATION_TYPE_DESC: text,
  CITY_WARD: text,
  DISTRICT: text,
});
export type SourceRow = z.infer<typeof sourceRowSchema>;

export const permitRowSchema = z.object({
  permit: z.string().min(1),
  /** The utility, agency or company holding the permit; null when it may be a person. */
  client: z.string().nullable(),
  /** Set when a client name was left out because it doesn't read as a company or agency. */
  clientWithheld: z.literal(true).optional(),
  work: z.string().nullable(),
  status: z.string().nullable(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  /** Toronto Centreline segment the permit is filed against. */
  geoId: z.string().nullable(),
  /** Address or street, without the free-text description. */
  location: z.string().nullable(),
  /** "Between A AND B" or "Intersected By C", as Toronto writes it. */
  crossStreets: z.string().nullable(),
  ward: z.string().nullable(),
  district: z.string().nullable(),
});
export type PermitRow = z.infer<typeof permitRowSchema>;

// Almost every client is a utility, a city division or a contractor, but now and then a permit is
// filed under a private person's name. Only names that read as a company or agency are kept; an
// unfamiliar small firm can be withheld too, which is the safe way to be wrong.
const COMPANY =
  /\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LP|L\.P|GP|ULC|LLC|PARTNERS|PARTNERSHIP|GROUP|SERVICES?|CONSTRUCTION|CONSTRUCTORS?|CONTRACTING|CONTRACTORS?|CONNECTORS?|CONNECT|BUILDERS|PAVING|ENGINEERING|ENGINEERS|CONSULTING|CONSULTANTS|ARCHITECTS?|DEVELOPMENTS?|INFRASTRUCTURE|SOLUTIONS|MANAGEMENT|TECHNOLOGIES|COMMUNICATIONS|NETWORKS?|ALLIANCE|CENTRE|CONSERVANCY|UTILITIES|UTILITY|ENERGY|PIPELINES?|HYDRO|WATER|WASTEWATER|GAS|ELECTRIC|MEDIA|TRANSIT|TRANSPORTATION|ENFORCEMENT|TORONTO|CITY|REGION|MUNICIPALITY|AUTHORITY|AGENCY|METROLINX|TTC|ECS|TW|ENBRIDGE|BELL|ROGERS|TELUS|BEANFIELD|ZAYO|ENWAVE|ALECTRA|CANADA|ONTARIO)\b/i;

export const isCompanyName = (name: string) => COMPANY.test(name);

// DISPLAY_DESC reads "154 ROBINA AVE [ Description: ... ], (Between GLENHURST AVE AND EARLSDALE
// AVE)". The description is free text typed by the applicant and has held city staff's names,
// phone numbers and email addresses, so it is dropped. Greedy to the last bracket, since the text
// itself can hold brackets.
const DESCRIPTION = /\s*,?\s*\[ Description:[\s\S]*\]\s*,?/;
// Greedy to the last parenthesis: cross streets can carry their own, as in "CHURCH ST (TO)".
const CROSS = /\s*,?\s*\(((?:Between|Intersected By) .*)\)/;

const tidy = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/(\s*,)+\s*$/, '')
    .replace(/\s+,/g, ',')
    .trim();

/** The address and cross streets in a DISPLAY_DESC, without the free-text description. */
export const splitLocation = (
  display: string | null,
): { location: string | null; crossStreets: string | null } => {
  if (!display) return { location: null, crossStreets: null };
  const withoutDescription = display.replace(DESCRIPTION, '');
  const cross = CROSS.exec(withoutDescription);
  const location = tidy(cross ? withoutDescription.replace(cross[0], '') : withoutDescription);
  return { location: location || null, crossStreets: cross ? tidy(cross[1]!) : null };
};

// The description is gone, but an address field is still free text at heart, so anything that
// looks like an email address or phone number is dropped rather than archived.
const withoutContacts = (value: string | null) =>
  value !== null && contactDetailsIn(value).length > 0 ? null : value;

const clean = (value: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const toPermitRow = (source: SourceRow): PermitRow => {
  const { location, crossStreets } = splitLocation(source.DISPLAY_DESC);
  const name = clean(source.CLIENT_NAME);
  const withheld = name !== null && !isCompanyName(name);
  return {
    permit: source.PERMIT_NUMBER.trim(),
    client: withheld ? null : name,
    ...(withheld && { clientWithheld: true as const }),
    work: clean(source.INSTALLATION_TYPE_DESC),
    status: clean(source.PERMIT_STATUS),
    from: clean(source.PROPOSED_FROM_DATE),
    to: clean(source.PROPOSED_TO_DATE),
    geoId: clean(source.GEO_ID),
    location: withoutContacts(location),
    crossStreets: withoutContacts(crossStreets),
    ward: clean(source.CITY_WARD),
    district: clean(source.DISTRICT),
  };
};
