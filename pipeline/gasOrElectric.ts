/**
 * Gas or electric, for permits of a company that runs both (PG&E in San Francisco, SDG&E in San
 * Diego, Xcel in Denver), whether the company holds the permit or a contractor digs for it. The
 * company's name says nothing about which: "conduits for PG&E power" is electric. So the work
 * written on the permit decides first, then the contractor's trade ("Phoenix Electric",
 * "Sheeran Pipeline"), and only then the city's default, marked assumed so the card can say so.
 */

export type Energy = 'gas' | 'electric';

export interface EnergyWork {
  utility: Energy;
  /** Nothing said which, so the city's default stands in. */
  assumed: boolean;
}

// PG&E's programs and parts are in here too (Kerotest valves, GPRP and MWC 14 and 50 gas main and
// service work, FIP fittings); no other utility's permits use those words.
const GAS =
  /\bgas\b|(?<!(sewage|sewer|water) )leak|kerotest|valve|gprp|\bmwc ?(14|50)|\bpsi\b|regulator|\bfip\b|cathodic|anode/i;
// Gas unless the work says electric: a pole has a riser too, and "power service meter" is electric.
const GAS_UNLESS_ELECTRIC = /copper|\bmeters?\b|risers?\b/i;
// kV is often written against the number ("230kV").
const ELECTRIC =
  /electric|\bpower\b|meter pedestal|burnout|splice|transformer|switch|\bug\b|rule ?20|\bpoles?\b|(\b|\d)kv\b|primary|secondary|\boh to ug\b|overhead to underground|undergrounding/i;
// Usually electric, unless the work says gas: "two PG&E gas conduits" is gas.
const ELECTRIC_UNLESS_GAS = /vault|conduit|\bcables?\b|pedestal|enclosure|joint trench|substructure/i;
// A manhole is too, unless the permit names other work: a sewer job's manhole is the sewer's.
const MANHOLE = /manhole|\bmh\b/i;

// A contractor's name that names one trade. "Pacific Gas & Electric" names both, so it says nothing.
const ELECTRIC_TRADE = /electric|\bpower\b/i;
const GAS_TRADE = /\bgas\b|pipeline/i;
const tradeOf = (holder: string): Energy | null => {
  const gas = GAS_TRADE.test(holder);
  if (gas === ELECTRIC_TRADE.test(holder)) return null;
  return gas ? 'gas' : 'electric';
};

/**
 * What the work text says, without guessing. `manhole` is a manhole that names no gas: electric
 * unless the permit names other work.
 */
export const readEnergy = (text: string) => {
  const surelyElectric = ELECTRIC.test(text);
  const gas = GAS.test(text) || (!surelyElectric && GAS_UNLESS_ELECTRIC.test(text));
  return {
    gas,
    electric: surelyElectric || (!gas && ELECTRIC_UNLESS_GAS.test(text)),
    manhole: !gas && MANHOLE.test(text),
  };
};

/**
 * Each of gas and electric a permit dug for. `holder` is whoever's name is on the permit, read
 * only for its trade when the work is silent; `fallback` is the city's more common work.
 * `otherWork` says the permit also names other work (a water main, fiber): then a manhole may be
 * that work's, and with nothing pointing at gas or electric the company was only
 * being worked around ("Water main, relocate PG&E"), so nothing comes back.
 */
export const energyWork = (
  text: string,
  options: { holder?: string; fallback: Energy; otherWork?: boolean },
): EnergyWork[] => {
  const said = readEnergy(text);
  const electric = said.electric || (said.manhole && !options.otherWork);
  if (!said.gas && !electric) {
    const trade = tradeOf(options.holder ?? '');
    if (!trade && options.otherWork) return [];
    return [{ utility: trade ?? options.fallback, assumed: !trade }];
  }
  const works: EnergyWork[] = [];
  if (said.gas) works.push({ utility: 'gas', assumed: false });
  if (electric) works.push({ utility: 'electric', assumed: false });
  return works;
};
