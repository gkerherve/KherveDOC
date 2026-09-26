import { COLORS_DEFAULT } from '@blocknote/core';
import * as Y from 'yjs';

import {
  FIRST_LINE_INDENTS,
  LINE_SPACINGS,
  PARAGRAPH_SPACINGS,
} from '../components/custom-blocks/paragraphProps';
import { fontStack, isFontSize } from '../components/custom-styles';
import { SETTINGS_MAP } from '../page-setup/pageSetup';

const DOC_STYLES_KEY = 'docStyles';

/** Built-in paragraph kinds whose look a document can redefine. */
export const BUILTIN_TARGETS = [
  'paragraph',
  'heading-1',
  'heading-2',
  'heading-3',
  'quote',
] as const;
export type BuiltinTarget = (typeof BUILTIN_TARGETS)[number];

export const ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

/** A paragraph style; empty values mean "not set by this style". */
export interface StyleFormat {
  fontFamily: string;
  fontSize: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  textColor: string;
  textAlignment: '' | (typeof ALIGNMENTS)[number];
  lineSpacing: string;
  spaceBefore: string;
  spaceAfter: string;
  firstLineIndent: string;
}

export interface CustomStyle extends StyleFormat {
  /** Stored on blocks as `styleName`; lowercase letters, digits and dashes. */
  id: string;
  name: string;
}

export interface DocStyles {
  builtins: Partial<Record<BuiltinTarget, StyleFormat>>;
  custom: CustomStyle[];
}

export const EMPTY_FORMAT: StyleFormat = {
  fontFamily: '',
  fontSize: '',
  bold: false,
  italic: false,
  underline: false,
  textColor: '',
  textAlignment: '',
  lineSpacing: '',
  spaceBefore: '',
  spaceAfter: '',
  firstLineIndent: '',
};

export const EMPTY_DOC_STYLES: DocStyles = { builtins: {}, custom: [] };

const MAX_STYLES = 50;
const STYLE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const FONT_NAME = /^[\p{L}\p{N} ._-]{1,60}$/u;

const pick = <T extends string>(value: unknown, allowed: readonly T[]) =>
  allowed.includes(value as T) ? (value as T) : '';

/** Collaborators can write anything into the map, so every field is validated. */
export const sanitizeFormat = (raw: unknown): StyleFormat => {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    fontFamily:
      typeof value.fontFamily === 'string' && FONT_NAME.test(value.fontFamily)
        ? value.fontFamily
        : '',
    fontSize:
      typeof value.fontSize === 'string' && isFontSize(value.fontSize)
        ? value.fontSize
        : '',
    bold: value.bold === true,
    italic: value.italic === true,
    underline: value.underline === true,
    textColor: pick(value.textColor, Object.keys(COLORS_DEFAULT)),
    textAlignment: pick(value.textAlignment, ALIGNMENTS),
    lineSpacing: pick(value.lineSpacing, LINE_SPACINGS),
    spaceBefore: pick(value.spaceBefore, PARAGRAPH_SPACINGS),
    spaceAfter: pick(value.spaceAfter, PARAGRAPH_SPACINGS),
    firstLineIndent: pick(value.firstLineIndent, FIRST_LINE_INDENTS),
  };
};

export const sanitizeDocStyles = (raw: unknown): DocStyles => {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const builtinsRaw = (
    value.builtins && typeof value.builtins === 'object' ? value.builtins : {}
  ) as Record<string, unknown>;
  const builtins: DocStyles['builtins'] = {};
  for (const target of BUILTIN_TARGETS) {
    if (builtinsRaw[target]) {
      builtins[target] = sanitizeFormat(builtinsRaw[target]);
    }
  }

  const seen = new Set<string>();
  const custom: CustomStyle[] = [];
  for (const item of Array.isArray(value.custom) ? value.custom : []) {
    const entry = (item && typeof item === 'object' ? item : {}) as Record<
      string,
      unknown
    >;
    const id = typeof entry.id === 'string' ? entry.id : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (
      !STYLE_ID.test(id) ||
      !name ||
      seen.has(id) ||
      custom.length >= MAX_STYLES
    ) {
      continue;
    }
    seen.add(id);
    custom.push({ ...sanitizeFormat(entry), id, name: name.slice(0, 60) });
  }
  return { builtins, custom };
};

export const readDocStyles = (ydoc?: Y.Doc): DocStyles =>
  sanitizeDocStyles(ydoc?.getMap(SETTINGS_MAP).get(DOC_STYLES_KEY));

export const writeDocStyles = (ydoc: Y.Doc, styles: DocStyles) => {
  ydoc.getMap(SETTINGS_MAP).set(DOC_STYLES_KEY, sanitizeDocStyles(styles));
};

/** A unique style id derived from its name. */
export const styleIdFor = (name: string, taken: readonly string[]) => {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'style';
  let id = /^[a-z0-9]/.test(base) ? base : `s-${base}`;
  for (let n = 2; taken.includes(id); n++) {
    id = `${base}-${n}`;
  }
  return id;
};

/* --------------------------------- Screen -------------------------------- */

const TARGET_SELECTORS: Record<BuiltinTarget, string> = {
  paragraph:
    '.bn-block-content[data-content-type="paragraph"]:not([data-style-name])',
  'heading-1':
    '.bn-block-content[data-content-type="heading"][data-level="1"]:not([data-style-name])',
  'heading-2':
    '.bn-block-content[data-content-type="heading"][data-level="2"]:not([data-style-name])',
  'heading-3':
    '.bn-block-content[data-content-type="heading"][data-level="3"]:not([data-style-name])',
  quote: '.bn-block-content[data-content-type="quote"]:not([data-style-name])',
};

const formatCss = (block: string, format: StyleFormat) => {
  const text: string[] = [];
  const box: string[] = [];
  if (format.fontFamily) {
    text.push(`font-family: ${fontStack(format.fontFamily)};`);
  }
  if (format.fontSize) {
    // Headings size their text through --level; direct font-size marks sit
    // on inner spans, so they still win.
    box.push(`--level: ${format.fontSize} !important;`);
    text.push(`font-size: ${format.fontSize};`);
  }
  if (format.bold) {
    text.push('font-weight: 700;');
  }
  if (format.italic) {
    text.push('font-style: italic;');
  }
  if (format.underline) {
    text.push('text-decoration: underline;');
  }
  if (format.textColor) {
    text.push(`color: ${COLORS_DEFAULT[format.textColor].text};`);
  }
  if (format.textAlignment) {
    // On the block, so direct alignment (set there with !important) wins.
    box.push(`text-align: ${format.textAlignment};`);
  }
  if (format.lineSpacing) {
    text.push(`line-height: ${format.lineSpacing};`);
  }
  if (format.firstLineIndent) {
    text.push(`text-indent: ${format.firstLineIndent}cm;`);
  }
  if (format.spaceBefore) {
    box.push(`margin-top: ${format.spaceBefore}pt;`);
  }
  if (format.spaceAfter) {
    box.push(`margin-bottom: ${format.spaceAfter}pt;`);
  }
  return [
    box.length ? `${block} { ${box.join(' ')} }` : '',
    text.length ? `${block} .bn-inline-content { ${text.join(' ')} }` : '',
  ].join('\n');
};

/** Editor CSS for the document's styles (ids and values are validated). */
export const docStylesCss = (styles: DocStyles) =>
  [
    ...BUILTIN_TARGETS.filter((target) => styles.builtins[target]).map(
      (target) =>
        formatCss(
          TARGET_SELECTORS[target],
          styles.builtins[target] as StyleFormat,
        ),
    ),
    ...styles.custom.map((style) =>
      formatCss(`.bn-block-content[data-style-name="${style.id}"]`, style),
    ),
  ].join('\n');

/* --------------------------------- Export -------------------------------- */

type AnyBlock = {
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: AnyBlock[];
};

const builtinTarget = (block: AnyBlock): BuiltinTarget | undefined => {
  if (block.type === 'paragraph' || block.type === 'quote') {
    return block.type;
  }
  if (block.type === 'heading') {
    const level = Number(block.props?.level);
    return level >= 1 && level <= 3
      ? (`heading-${level}` as BuiltinTarget)
      : undefined;
  }
  return undefined;
};

const applyToText = (content: unknown, format: StyleFormat) => {
  if (!Array.isArray(content)) {
    return;
  }
  const defaults = {
    ...(format.fontFamily && { fontFamily: format.fontFamily }),
    ...(format.fontSize && { fontSize: format.fontSize }),
    ...(format.bold && { bold: true }),
    ...(format.italic && { italic: true }),
    ...(format.underline && { underline: true }),
    ...(format.textColor && { textColor: format.textColor }),
  };
  if (!Object.keys(defaults).length) {
    return;
  }
  for (const item of content as {
    type?: string;
    styles?: Record<string, unknown>;
    content?: unknown;
  }[]) {
    if (item?.type === 'text') {
      // Direct formatting on the text wins over the style.
      item.styles = { ...defaults, ...item.styles };
    } else if (item?.type === 'link') {
      applyToText(item.content, format);
    }
  }
};

/**
 * Bakes the document's styles into a copy of the blocks for export: style
 * values fill in wherever a block or its text has no direct formatting.
 * Mutates `blocks`: pass a copy such as `editor.document`.
 */
export const applyDocStyles = <T extends readonly unknown[]>(
  blocks: T,
  styles: DocStyles,
): T => {
  const byId = new Map(styles.custom.map((style) => [style.id, style]));

  const visit = (block: AnyBlock) => {
    const styleName = block.props?.styleName;
    const target = builtinTarget(block);
    const format =
      (typeof styleName === 'string' && byId.get(styleName)) ||
      (target && styles.builtins[target]);

    if (format && block.props) {
      const props = block.props;
      const fill = (key: string, value: string) => {
        if (value && (props[key] === undefined || props[key] === 'default')) {
          props[key] = value;
        }
      };
      fill('lineSpacing', format.lineSpacing);
      fill('spaceBefore', format.spaceBefore);
      fill('spaceAfter', format.spaceAfter);
      fill('firstLineIndent', format.firstLineIndent);
      if (
        format.textAlignment &&
        (!props.textAlignment || props.textAlignment === 'left')
      ) {
        props.textAlignment = format.textAlignment;
      }
      applyToText(block.content, format);
    }
    block.children?.forEach(visit);
  };

  (blocks as readonly AnyBlock[]).forEach(visit);
  return blocks;
};
