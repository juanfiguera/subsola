import { contactDetailsIn } from '../insights/privacy';
import { isCompanyName } from './permits';

/**
 * Privacy rules shared by the Boston and Cambridge snapshots. See docs/archive.md for what is kept
 * and why the rest is never requested.
 */

/**
 * A source field whose name matches this is about a person: the applicant, a contact, a licence
 * holder. None may be in a snapshot's allowlist. Company name fields are the one exception, and
 * only because `keepAllowed` puts every value through `isMassachusettsCompany` before it is
 * written. The date an application came in says nothing about who sent it, so it is let through.
 */
export const PERSON_FIELD =
  /name|phone|e_?mail|contact|licen[cs]e|hoist|applicant(?!_submit_date$)|owner|person|resident|attest|on_behalf/i;
export const COMPANY_FIELD = /(^|_)company_name$/;

// Utilities, agencies and trades that turn up in Boston's and Cambridge's permits without one of
// the generic company words isCompanyName looks for.
const MASSACHUSETTS_COMPANY =
  /\b(GRID|EVERSOURCE|NSTAR|VERIZON|COMCAST|AT&T|CROWN CASTLE|FIRSTLIGHT|LIGHTOWER|WAVEGUIDE|MBTA|MIT|HARVARD|TUFTS|MWRA|MASSDOT|DOT|DPW|DCR|BOSTON|CAMBRIDGE|MASSACHUSETTS|MASS|COMMONWEALTH|COMMISSION|DEPARTMENT|DEPT|UNIVERSITY|COLLEGE|INSTITUTE|HOSPITAL|TRUSTEES|ASSOCIATES|ASSOCIATION|SOCIETY|FOUNDATION|BROS|BROTHERS|SONS|EXCAVATION|EXCAVATING|MASONRY|ROOFING|LANDSCAPING|LANDSCAPE|PLUMBING|CONCRETE|ENVIRONMENTAL|PROPERTIES|RESTORATION|RESTORATIONS|RENTALS|CRANE|HOTEL)\b/i;

// A permit's company field sometimes carries a person alongside the firm: "Firm - Jane Doe",
// "Firm (PM: Jane Doe)", "Jane Doe dba Firm", "Firm, Jane Doe", "Firm/ Jane". Each piece has to
// read as a company on its own, so a name riding along withholds the whole value.
const SEPARATOR = /\s[-–]\s?|[-–]\s|[()/,:]|\bdba\b/i;
// Normalised before splitting so "Firm, Inc" and "Firm d/b/a Brand" stay one piece each side.
const SUFFIX_AFTER_COMMA = /,\s*(INC|INCORPORATED|LLC|L\.L\.C|CO|CORP|LTD|LP|LLP|PC|PBC)\b/gi;
const DOING_BUSINESS_AS = /\bd\s?[./]?\s?b\s?[./]?\s?a\b\.?/gi;

const readsAsCompany = (piece: string) => isCompanyName(piece) || MASSACHUSETTS_COMPANY.test(piece);

/** Whether a company field's value can be kept: every piece reads as a firm, and no contacts. */
export const isMassachusettsCompany = (name: string) => {
  if (contactDetailsIn(name).length > 0) return false;
  const pieces = name
    .replace(SUFFIX_AFTER_COMMA, ' $1')
    .replace(DOING_BUSINESS_AS, ' dba ')
    .split(SEPARATOR)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
  return pieces.length > 0 && pieces.every(readsAsCompany);
};

/**
 * The fields of one source row a snapshot keeps, in allowlist order. Anything the server sent
 * beyond the allowlist is dropped here too, so a source that ignores the field list can't leak a
 * column. A company name that may be a person's is replaced by `<field>_withheld: true`, and any
 * other text that looks like it holds a phone number or email address becomes null.
 */
export const keepAllowed = (
  source: Record<string, unknown>,
  allowlist: readonly string[],
): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  for (const field of allowlist) {
    const value = source[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      row[field] = value;
      continue;
    }
    const text = value.trim();
    if (COMPANY_FIELD.test(field) && text && !isMassachusettsCompany(text)) {
      row[field] = null;
      row[`${field}_withheld`] = true;
    } else {
      row[field] = text && contactDetailsIn(text).length === 0 ? text : null;
    }
  }
  return row;
};
