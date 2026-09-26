import { createInlineContentSpec } from '@blocknote/core';

// Server twin of the frontend footnote (custom-inline-content/Footnote).
// Exported HTML has no numbering, so the note is kept inline in brackets.
export const FootnoteInline = createInlineContentSpec(
  {
    type: 'footnote' as const,
    propSchema: { text: { default: '' } },
    content: 'none' as const,
  },
  {
    render: (inlineContent) => {
      const dom = document.createElement('small');
      dom.className = 'footnote';
      dom.textContent = `[${inlineContent.props.text}]`;
      return { dom };
    },
  },
);
