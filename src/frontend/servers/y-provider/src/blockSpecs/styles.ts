import { createStyleSpec } from '@blocknote/core';

// Server-side twins of the frontend's text styles
// (apps/impress/src/features/docs/doc-editor/components/custom-styles).
// Without them, y-prosemirror drops any text carrying these marks.

const PT_SIZE = /^\d{1,3}(\.\d{1,2})?pt$/;

export const FontFamilyStyle = createStyleSpec(
  { type: 'fontFamily', propSchema: 'string' },
  {
    render: (value) => {
      const span = document.createElement('span');
      if (value) {
        span.style.fontFamily = `"${value.replace(/["\\]/g, '')}"`;
      }
      return { dom: span, contentDOM: span };
    },
  },
);

export const FontSizeStyle = createStyleSpec(
  { type: 'fontSize', propSchema: 'string' },
  {
    render: (value) => {
      const span = document.createElement('span');
      if (value && PT_SIZE.test(value)) {
        span.style.fontSize = value;
      }
      return { dom: span, contentDOM: span };
    },
  },
);

export const SuperscriptStyle = createStyleSpec(
  { type: 'superscript', propSchema: 'boolean' },
  {
    render: () => {
      const sup = document.createElement('sup');
      return { dom: sup, contentDOM: sup };
    },
  },
);

export const SubscriptStyle = createStyleSpec(
  { type: 'subscript', propSchema: 'boolean' },
  {
    render: () => {
      const sub = document.createElement('sub');
      return { dom: sub, contentDOM: sub };
    },
  },
);

export const customStyleSpecs = {
  fontFamily: FontFamilyStyle,
  fontSize: FontSizeStyle,
  superscript: SuperscriptStyle,
  subscript: SubscriptStyle,
};
