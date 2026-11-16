// APWA Uniform Color Code (ANSI Z535.1), the same colors locators paint on the street.
// Crews already read these, so the map uses them instead of an arbitrary palette. On the map,
// these hues mean utilities and nothing else: no other marker borrows them.
export const UTILITY_KINDS = [
  'electric',
  'gas',
  'telecom',
  'water',
  'sewer',
  'steam',
  'capital',
] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number];

export interface UtilityStyle {
  label: string;
  color: string;
  apwa: string;
}

export const UTILITY_STYLES: Record<UtilityKind, UtilityStyle> = {
  electric: { label: 'Electric', color: '#e3262b', apwa: 'Red' },
  gas: { label: 'Gas', color: '#f2c200', apwa: 'Yellow' },
  telecom: { label: 'Telecom', color: '#f47c20', apwa: 'Orange' },
  water: { label: 'Water', color: '#1f6fd1', apwa: 'Blue' },
  sewer: { label: 'Sewer', color: '#2e9a48', apwa: 'Green' },
  // APWA groups steam with gas under yellow. A pale shade keeps it in that family while staying
  // distinct from gas; its glass conduit look and labels tell them apart too. Purple would be
  // wrong: in the code it means reclaimed water.
  steam: { label: 'Steam', color: '#fde68a', apwa: 'Yellow' },
  capital: { label: 'City rebuild', color: '#7c8796', apwa: 'n/a' },
};

/**
 * Recycled water ("purple pipe") is water to the layer switches and the depth rules, but APWA
 * paints it purple so nobody mistakes it for drinking water, and so does the map.
 */
export const RECYCLED_WATER: UtilityStyle = {
  label: 'Recycled water',
  color: '#8a4fbf',
  apwa: 'Purple',
};

/** Dark ink on light paint (gas yellow), white on everything else, so badge text stays readable. */
export const inkOn = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#1b2230' : '#ffffff';
};
