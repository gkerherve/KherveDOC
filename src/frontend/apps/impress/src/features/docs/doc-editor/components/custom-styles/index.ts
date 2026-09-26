import { createStyleSpec } from '@blocknote/core';

// Keep in sync with src/frontend/servers/y-provider/src/blockSpecs/styles.ts:
// the converter drops text carrying a mark its schema does not know.

export type PdfFont = 'Helvetica' | 'Times-Roman' | 'Courier';

export interface FontFamily {
  name: string;
  stack: string;
  pdf: PdfFont;
  group: 'serif' | 'sans' | 'mono' | 'cjk';
}

// Free, openly licensed families first; the stacks fall back to common
// metric-compatible fonts when one is not installed.
export const FONT_FAMILIES: FontFamily[] = [
  {
    name: 'Liberation Serif',
    group: 'serif',
    pdf: 'Times-Roman',
    stack: "'Liberation Serif', 'Times New Roman', Times, serif",
  },
  {
    name: 'DejaVu Serif',
    group: 'serif',
    pdf: 'Times-Roman',
    stack: "'DejaVu Serif', Georgia, serif",
  },
  {
    name: 'Noto Serif',
    group: 'serif',
    pdf: 'Times-Roman',
    stack: "'Noto Serif', Georgia, serif",
  },
  {
    name: 'Latin Modern Roman',
    group: 'serif',
    pdf: 'Times-Roman',
    stack: "'Latin Modern Roman', 'CMU Serif', 'Computer Modern', serif",
  },
  {
    name: 'EB Garamond',
    group: 'serif',
    pdf: 'Times-Roman',
    stack: "'EB Garamond', Garamond, 'Times New Roman', serif",
  },
  {
    name: 'TeX Gyre Pagella',
    group: 'serif',
    pdf: 'Times-Roman',
    stack: "'TeX Gyre Pagella', 'Palatino Linotype', Palatino, serif",
  },
  {
    name: 'Georgia',
    group: 'serif',
    pdf: 'Times-Roman',
    stack: 'Georgia, serif',
  },
  {
    name: 'Times New Roman',
    group: 'serif',
    pdf: 'Times-Roman',
    stack: "'Times New Roman', 'Liberation Serif', Times, serif",
  },
  {
    name: 'Inter',
    group: 'sans',
    pdf: 'Helvetica',
    stack: "Inter, 'Liberation Sans', Arial, sans-serif",
  },
  {
    name: 'Liberation Sans',
    group: 'sans',
    pdf: 'Helvetica',
    stack: "'Liberation Sans', Arial, Helvetica, sans-serif",
  },
  {
    name: 'DejaVu Sans',
    group: 'sans',
    pdf: 'Helvetica',
    stack: "'DejaVu Sans', Verdana, sans-serif",
  },
  {
    name: 'Noto Sans',
    group: 'sans',
    pdf: 'Helvetica',
    stack: "'Noto Sans', 'Liberation Sans', Arial, sans-serif",
  },
  {
    name: 'Source Sans 3',
    group: 'sans',
    pdf: 'Helvetica',
    stack: "'Source Sans 3', 'Source Sans Pro', sans-serif",
  },
  {
    name: 'Open Sans',
    group: 'sans',
    pdf: 'Helvetica',
    stack: "'Open Sans', 'Liberation Sans', sans-serif",
  },
  {
    name: 'Arial',
    group: 'sans',
    pdf: 'Helvetica',
    stack: "Arial, 'Liberation Sans', Helvetica, sans-serif",
  },
  {
    name: 'Verdana',
    group: 'sans',
    pdf: 'Helvetica',
    stack: "Verdana, 'DejaVu Sans', sans-serif",
  },
  {
    name: 'Liberation Mono',
    group: 'mono',
    pdf: 'Courier',
    stack: "'Liberation Mono', 'Courier New', monospace",
  },
  {
    name: 'DejaVu Sans Mono',
    group: 'mono',
    pdf: 'Courier',
    stack: "'DejaVu Sans Mono', Menlo, monospace",
  },
  {
    name: 'Noto Sans Mono',
    group: 'mono',
    pdf: 'Courier',
    stack: "'Noto Sans Mono', 'Liberation Mono', monospace",
  },
  {
    name: 'Courier New',
    group: 'mono',
    pdf: 'Courier',
    stack: "'Courier New', 'Liberation Mono', Courier, monospace",
  },
  {
    name: 'Noto Sans CJK',
    group: 'cjk',
    pdf: 'Helvetica',
    stack:
      "'Noto Sans CJK SC', 'Noto Sans CJK JP', 'Noto Sans CJK KR', 'Source Han Sans', 'PingFang SC', 'Hiragino Sans', sans-serif",
  },
  {
    name: 'Noto Serif CJK',
    group: 'cjk',
    pdf: 'Times-Roman',
    stack:
      "'Noto Serif CJK SC', 'Noto Serif CJK JP', 'Noto Serif CJK KR', 'Source Han Serif', 'Songti SC', serif",
  },
];

export const FONT_SIZES = [
  8, 9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60,
  72,
];

const fontByName = new Map(FONT_FAMILIES.map((font) => [font.name, font]));

export const fontStack = (name: string) =>
  fontByName.get(name)?.stack ?? `"${name.replace(/["\\]/g, '')}", sans-serif`;

export const pdfFont = (name: string): PdfFont =>
  fontByName.get(name)?.pdf ?? 'Helvetica';

const PT_SIZE = /^\d{1,3}(\.\d{1,2})?pt$/;

export const isFontSize = (value?: string): value is string =>
  !!value && PT_SIZE.test(value);

export const fontSizePt = (value?: string) =>
  isFontSize(value) ? parseFloat(value) : undefined;

const cssSizeToPt = (size: string) => {
  const match = /^(\d+(?:\.\d+)?)(pt|px)$/.exec(size.trim());
  if (!match) {
    return undefined;
  }
  const pt =
    match[2] === 'pt'
      ? Number(match[1])
      : Math.round(Number(match[1]) * 1.5) / 2;
  return `${pt}pt`;
};

const firstFamily = (family: string) =>
  family
    .split(',')[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, '') || undefined;

export const FontFamilyStyle = createStyleSpec(
  { type: 'fontFamily', propSchema: 'string' },
  {
    render: (value) => {
      const span = document.createElement('span');
      if (value) {
        span.style.fontFamily = fontStack(value);
      }
      return { dom: span, contentDOM: span };
    },
    parse: (element) =>
      element.tagName === 'SPAN' && element.style.fontFamily
        ? firstFamily(element.style.fontFamily)
        : undefined,
  },
);

export const FontSizeStyle = createStyleSpec(
  { type: 'fontSize', propSchema: 'string' },
  {
    render: (value) => {
      const span = document.createElement('span');
      if (isFontSize(value)) {
        span.style.fontSize = value;
      }
      return { dom: span, contentDOM: span };
    },
    parse: (element) =>
      element.tagName === 'SPAN' && element.style.fontSize
        ? cssSizeToPt(element.style.fontSize)
        : undefined,
  },
);

export const SuperscriptStyle = createStyleSpec(
  { type: 'superscript', propSchema: 'boolean' },
  {
    render: () => {
      const sup = document.createElement('sup');
      return { dom: sup, contentDOM: sup };
    },
    parse: (element) => (element.tagName === 'SUP' ? true : undefined),
  },
);

export const SubscriptStyle = createStyleSpec(
  { type: 'subscript', propSchema: 'boolean' },
  {
    render: () => {
      const sub = document.createElement('sub');
      return { dom: sub, contentDOM: sub };
    },
    parse: (element) => (element.tagName === 'SUB' ? true : undefined),
  },
);

export const customStyleSpecs = {
  fontFamily: FontFamilyStyle,
  fontSize: FontSizeStyle,
  superscript: SuperscriptStyle,
  subscript: SubscriptStyle,
};
