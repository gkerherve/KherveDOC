import * as Y from 'yjs';

/** Document-wide settings live in this Yjs map, saved with the document. */
export const SETTINGS_MAP = 'khervedoc-settings';
const PAGE_SETUP_KEY = 'pageSetup';

export const PAPER_SIZES = {
  A4: { width: 21, height: 29.7, label: 'A4 (21 × 29.7 cm)' },
  A5: { width: 14.8, height: 21, label: 'A5 (14.8 × 21 cm)' },
  A3: { width: 29.7, height: 42, label: 'A3 (29.7 × 42 cm)' },
  Letter: { width: 21.59, height: 27.94, label: 'US Letter (8.5 × 11 in)' },
  Legal: { width: 21.59, height: 35.56, label: 'US Legal (8.5 × 14 in)' },
} as const;

export type PaperSize = keyof typeof PAPER_SIZES;
export type Orientation = 'portrait' | 'landscape';
export type PageNumberPosition =
  'none' | 'bottom-center' | 'bottom-right' | 'top-right';

export interface PageSetup {
  paperSize: PaperSize;
  orientation: Orientation;
  /** Margins in centimetres. */
  margins: { top: number; bottom: number; left: number; right: number };
  header: string;
  footer: string;
  pageNumbers: PageNumberPosition;
  /** Show the document as a sheet of paper while editing. */
  showPage: boolean;
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 },
  header: '',
  footer: '',
  pageNumbers: 'bottom-center',
  showPage: true,
};

const MAX_TEXT = 200;
const clampMargin = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 10) : fallback;
};
const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
) => (allowed.includes(value as T) ? (value as T) : fallback);
const text = (value: unknown) =>
  typeof value === 'string' ? value.slice(0, MAX_TEXT) : '';

/** Collaborators can write anything into the map, so every field is validated. */
export const sanitizePageSetup = (raw: unknown): PageSetup => {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const margins = (
    value.margins && typeof value.margins === 'object' ? value.margins : {}
  ) as Record<string, unknown>;
  const d = DEFAULT_PAGE_SETUP;
  return {
    paperSize: oneOf(
      value.paperSize,
      Object.keys(PAPER_SIZES) as PaperSize[],
      d.paperSize,
    ),
    orientation: oneOf(
      value.orientation,
      ['portrait', 'landscape'] as const,
      d.orientation,
    ),
    margins: {
      top: clampMargin(margins.top, d.margins.top),
      bottom: clampMargin(margins.bottom, d.margins.bottom),
      left: clampMargin(margins.left, d.margins.left),
      right: clampMargin(margins.right, d.margins.right),
    },
    header: text(value.header),
    footer: text(value.footer),
    pageNumbers: oneOf(
      value.pageNumbers,
      ['none', 'bottom-center', 'bottom-right', 'top-right'] as const,
      d.pageNumbers,
    ),
    showPage: typeof value.showPage === 'boolean' ? value.showPage : d.showPage,
  };
};

export const readPageSetup = (ydoc?: Y.Doc): PageSetup =>
  sanitizePageSetup(ydoc?.getMap(SETTINGS_MAP).get(PAGE_SETUP_KEY));

export const writePageSetup = (ydoc: Y.Doc, setup: PageSetup) => {
  ydoc.getMap(SETTINGS_MAP).set(PAGE_SETUP_KEY, sanitizePageSetup(setup));
};

/** Paper dimensions in centimetres, taking orientation into account. */
export const pageDimensions = (setup: PageSetup) => {
  const { width, height } = PAPER_SIZES[setup.paperSize];
  return setup.orientation === 'landscape'
    ? { width: height, height: width }
    : { width, height };
};

export const CM_TO_PX = 96 / 2.54;
export const CM_TO_PT = 72 / 2.54;
export const CM_TO_TWIPS = 1440 / 2.54;
