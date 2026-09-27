/**
 * SOV Slides: the shared presentation document.
 *
 * Like SOV Sheets's workbook, it is a Yjs document of maps holding JSON
 * strings, so each slide and each box on a slide merges on its own when
 * several people edit at once:
 *
 * - `slides`   — slide id → JSON SlideMeta {order, background, notes}
 * - `elements` — element id → JSON SlideElement (a text box, a shape or a
 *                picture, placed on one slide)
 * - `deck`     — "theme" → the theme's id
 *
 * Positions and sizes are in pixels of a 960 × 540 slide (16:9), which is
 * PowerPoint's 10 × 5.625 inch slide at 96 pixels per inch.
 */

export const SLIDES = 'slides';
export const ELEMENTS = 'elements';
export const DECK = 'deck';

export const SLIDE_W = 960;
export const SLIDE_H = 540;

export interface SlideMeta {
  order: number;
  /** Colour of the slide's background; none: the theme's. */
  background?: string;
  /** Speaker notes. */
  notes?: string;
}

export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'arrowRight'
  | 'star'
  | 'line'
  | 'arrow';

export const SHAPES: ShapeKind[] = [
  'rect',
  'roundRect',
  'ellipse',
  'triangle',
  'diamond',
  'arrowRight',
  'star',
  'line',
  'arrow',
];

/** What a text box is for: the theme colours and fonts follow it. */
export type TextRole = 'title' | 'subtitle' | 'body';

export interface TextStyle {
  /** Font size, in pixels of the 960-wide slide. */
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  font?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  /** One bullet per line. */
  bullets?: boolean;
  /** Numbered lines (1. 2. 3.) instead of bullets. */
  numbered?: boolean;
}

export interface SlideElement {
  slide: string;
  /** Stacking order on the slide: higher is in front. */
  z: number;
  type: 'text' | 'shape' | 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation?: number;
  role?: TextRole;
  /** Lines of text (shapes can hold text too). */
  text?: string;
  style?: TextStyle;
  shape?: ShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** A picture, as a data: URL (kept in the document itself). */
  src?: string;
  /** 0 (transparent) to 1. */
  opacity?: number;
}

export interface Slide {
  id: string;
  meta: SlideMeta;
}

export interface PlacedElement {
  id: string;
  el: SlideElement;
}

export const parseJson = <T>(raw: unknown): T | undefined => {
  if (typeof raw !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

export const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

/**
 * A box's text style with the defaults filled in: text in a shape sits in
 * the middle, in white (as in PowerPoint); other text starts top left.
 */
export const effectiveStyle = (
  el: SlideElement,
): TextStyle & {
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
} => {
  const inShape = el.type === 'shape';
  const style = el.style ?? {};
  return {
    ...style,
    align: style.align ?? (inShape ? 'center' : 'left'),
    valign: style.valign ?? (inShape ? 'middle' : 'top'),
    color: style.color ?? (inShape ? '#ffffff' : undefined),
  };
};
