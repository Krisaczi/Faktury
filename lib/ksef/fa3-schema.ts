/**
 * FA(3) schema definition — element ordering, cardinality, and dependencies.
 *
 * This is the single source of truth for the FA(3) <Fa> element sequence.
 * Both the XML builder and the validator consume this definition so that
 * ordering rules are never duplicated or allowed to drift.
 *
 * Reference: http://crd.gov.pl/wzor/2025/06/25/13775/ (FA(3) logical schema)
 */

// ─── P_13 VAT summary field metadata ──────────────────────────────────────────

/**
 * Each P_13_* field corresponds to a VAT category in the FA(3) summary.
 * The `order` field defines the position within the <Fa> element sequence.
 * `aggregatesWith` marks rates that share the same P_13 element (e.g. np + np_ii → P_13_8).
 */
export interface P13FieldDef {
  element:         string;
  p12Value:        string;
  hasVat:          boolean;
  order:           number;
  aggregatesWith?: string;
}

export const P13_FIELDS: Record<string, P13FieldDef> = {
  '23':    { element: 'P_13_1',   p12Value: '23',    hasVat: true,  order: 1 },
  '8':     { element: 'P_13_2',   p12Value: '8',     hasVat: true,  order: 2 },
  '5':     { element: 'P_13_3',   p12Value: '5',     hasVat: true,  order: 3 },
  '0':     { element: 'P_13_5',   p12Value: '0',     hasVat: false, order: 5 },
  '0_kr':  { element: 'P_13_6_1', p12Value: '0 KR',  hasVat: false, order: 6 },
  '0_wdt': { element: 'P_13_6_2', p12Value: '0 WDT', hasVat: false, order: 6 },
  '0_ex':  { element: 'P_13_6_3', p12Value: '0 EX',  hasVat: false, order: 6 },
  'zw':    { element: 'P_13_7',   p12Value: 'zw',    hasVat: false, order: 7 },
  'np':    { element: 'P_13_8',   p12Value: 'np I',  hasVat: false, order: 8 },
  'np_ii': { element: 'P_13_8',   p12Value: 'np II', hasVat: false, order: 8, aggregatesWith: 'np' },
  'oo':    { element: 'P_13_10',  p12Value: 'oo',    hasVat: false, order: 10 },
};

/** P_14 element for each taxable rate. */
export const P14_FIELDS: Record<string, string> = {
  '23': 'P_14_1',
  '8':  'P_14_2',
  '5':  'P_14_3',
};

/** Valid P_12 (TStawkaPodatmiu) codes per FA(3) specification. */
export const VALID_P12_VALUES = [
  '23', '22', '8', '7', '5', '4', '3', '0',
  '0 KR', '0 WDT', '0 EX',
  'zw', 'oo', 'np I', 'np II',
];

// ─── <Fa> element sequence ────────────────────────────────────────────────────

/**
 * The canonical ordering of elements within <Fa>, as defined by the FA(3) XSD.
 * Optional elements are marked `required: false`.
 *
 * The builder uses this to place elements in the correct position.
 * The validator uses this to verify element ordering in generated XML.
 */
export interface FaElementDef {
  name:     string;
  required: boolean;
  /** Elements that must appear before this one if present. */
  after?:   string[];
}

export const FA_ELEMENT_SEQUENCE: FaElementDef[] = [
  { name: 'KodWaluty', required: true },
  { name: 'P_1',       required: true },
  { name: 'P_1M',      required: false },
  { name: 'P_2',       required: true },
  { name: 'WZ',        required: false },
  // Choice: P_6 | OkresFa
  { name: 'P_6',       required: false },
  // VAT summary — P_13_1 through P_13_11 (all optional except P_13_9 and P_15)
  { name: 'P_13_1',    required: false },
  { name: 'P_14_1',    required: false, after: ['P_13_1'] },
  { name: 'P_13_2',    required: false },
  { name: 'P_14_2',    required: false, after: ['P_13_2'] },
  { name: 'P_13_3',    required: false },
  { name: 'P_14_3',    required: false, after: ['P_13_3'] },
  { name: 'P_13_4',    required: false },
  { name: 'P_14_4',    required: false, after: ['P_13_4'] },
  { name: 'P_13_5',    required: false },
  { name: 'P_14_5',    required: false, after: ['P_13_5'] },
  { name: 'P_13_6_1',  required: false, after: ['P_13_5'] },
  { name: 'P_13_6_2',  required: false, after: ['P_13_6_1'] },
  { name: 'P_13_6_3',  required: false, after: ['P_13_6_2'] },
  { name: 'P_13_7',    required: false, after: ['P_13_6_3'] },
  { name: 'P_13_8',    required: false, after: ['P_13_7'] },
  { name: 'P_13_9',    required: true,  after: ['P_13_8'] },
  { name: 'P_13_10',   required: false, after: ['P_13_9'] },
  { name: 'P_13_11',   required: false, after: ['P_13_10'] },
  { name: 'P_15',      required: true,  after: ['P_13_11'] },
  { name: 'KursWalutyZ', required: false, after: ['P_15'] },
  { name: 'Adnotacje', required: true,  after: ['P_15'] },
  { name: 'RodzajFaktury', required: true, after: ['Adnotacje'] },
  { name: 'PrzyczynaKorekty', required: false, after: ['RodzajFaktury'] },
  { name: 'TypKorekty', required: false, after: ['PrzyczynaKorekty'] },
  { name: 'DaneFaKorygowanej', required: false, after: ['TypKorekty'] },
  // FaWiersz (1..n)
  { name: 'FaWiersz',  required: true,  after: ['DaneFaKorygowanej'] },
  { name: 'Rozliczenie', required: false, after: ['FaWiersz'] },
  { name: 'Platnosc',  required: false, after: ['Rozliczenie'] },
];

/** Root-level element sequence (children of <Faktura>). */
export const ROOT_ELEMENT_SEQUENCE: FaElementDef[] = [
  { name: 'Naglowek',  required: true },
  { name: 'Podmiot1',  required: true },
  { name: 'Podmiot2',  required: true },
  { name: 'Podmiot3',  required: false },
  { name: 'PodmiotUpowazniony', required: false },
  { name: 'Fa',        required: true },
  { name: 'Stopka',    required: false },
  { name: 'Zalacznik', required: false },
];

/**
 * Get the canonical position index of an element within <Fa>.
 * Returns -1 if not found.
 */
export function faElementPosition(name: string): number {
  return FA_ELEMENT_SEQUENCE.findIndex(e => e.name === name);
}

/**
 * Check if element `a` should appear before element `b` in the <Fa> sequence.
 * Returns true if a's position is less than b's position.
 */
export function isBefore(a: string, b: string): boolean {
  return faElementPosition(a) < faElementPosition(b);
}

/**
 * Get all P_13 element names in canonical order (excluding P_13_9 and P_13_11).
 */
export function perRateP13Elements(): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const def of Object.values(P13_FIELDS)) {
    if (!seen.has(def.element)) {
      seen.add(def.element);
      result.push(def.element);
    }
  }
  return result.sort((a, b) => faElementPosition(a) - faElementPosition(b));
}
