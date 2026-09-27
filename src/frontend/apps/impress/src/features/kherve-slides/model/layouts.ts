/** Ready-made slides: the boxes a new slide starts with. */
import { SLIDE_H, SLIDE_W, SlideElement } from './types';

export type LayoutId =
  'title' | 'content' | 'two' | 'section' | 'quote' | 'titleOnly' | 'blank';

export type NewElement = Omit<SlideElement, 'slide' | 'z'>;

const M = 60;

export const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: 'title', label: 'Title slide' },
  { id: 'content', label: 'Title and content' },
  { id: 'two', label: 'Two columns' },
  { id: 'section', label: 'Section header' },
  { id: 'quote', label: 'Quote' },
  { id: 'titleOnly', label: 'Title only' },
  { id: 'blank', label: 'Blank' },
];

const title = (text: string, y = 40, h = 90): NewElement => ({
  type: 'text',
  role: 'title',
  x: M,
  y,
  w: SLIDE_W - 2 * M,
  h,
  text,
  style: { size: 44, bold: true, valign: 'middle' },
});

const body = (
  text: string,
  x: number,
  w: number,
  bullets = true,
): NewElement => ({
  type: 'text',
  role: 'body',
  x,
  y: 150,
  w,
  h: SLIDE_H - 150 - 50,
  text,
  style: { size: 26, bullets, valign: 'top' },
});

export const layoutElements = (id: LayoutId): NewElement[] => {
  switch (id) {
    case 'title':
      return [
        {
          ...title('Click to add a title', 170, 120),
          style: { size: 56, bold: true, align: 'center', valign: 'bottom' },
        },
        {
          type: 'text',
          role: 'subtitle',
          x: M * 2,
          y: 300,
          w: SLIDE_W - 4 * M,
          h: 70,
          text: 'Click to add a subtitle',
          style: { size: 26, align: 'center', valign: 'top' },
        },
      ];
    case 'content':
      return [
        title('Click to add a title'),
        body('First point\nSecond point\nThird point', M, SLIDE_W - 2 * M),
      ];
    case 'two': {
      const w = (SLIDE_W - 2 * M - 40) / 2;
      return [
        title('Click to add a title'),
        body('Left column', M, w),
        body('Right column', M + w + 40, w),
      ];
    }
    case 'section':
      return [
        {
          ...title('Section title', 190, 110),
          style: { size: 54, bold: true, valign: 'bottom' },
        },
        {
          type: 'shape',
          shape: 'rect',
          x: M,
          y: 310,
          w: 120,
          h: 8,
          stroke: 'none',
        },
        {
          type: 'text',
          role: 'subtitle',
          x: M,
          y: 330,
          w: SLIDE_W - 2 * M,
          h: 60,
          text: 'A few words about this part',
          style: { size: 24, valign: 'top' },
        },
      ];
    case 'quote':
      return [
        {
          type: 'text',
          role: 'title',
          x: M * 2,
          y: 120,
          w: SLIDE_W - 4 * M,
          h: 220,
          text: '“A quote that says it all.”',
          style: { size: 40, italic: true, align: 'center', valign: 'middle' },
        },
        {
          type: 'text',
          role: 'subtitle',
          x: M * 2,
          y: 360,
          w: SLIDE_W - 4 * M,
          h: 50,
          text: '— Someone wise',
          style: { size: 22, align: 'center' },
        },
      ];
    case 'titleOnly':
      return [title('Click to add a title')];
    case 'blank':
    default:
      return [];
  }
};
