import { createGlobalStyle } from 'styled-components';

import {
  FIRST_LINE_INDENTS,
  LINE_SPACINGS,
  PARAGRAPH_SPACINGS,
} from './paragraphProps';

const block = '.bn-block-content';

// Paragraph props are rendered by BlockNote as data-* attributes on the block.
const rules = [
  ...LINE_SPACINGS.map(
    (value) =>
      `${block}[data-line-spacing="${value}"] .bn-inline-content { line-height: ${value}; }`,
  ),
  ...PARAGRAPH_SPACINGS.map(
    (value) =>
      `${block}[data-space-before="${value}"] { margin-top: ${value}pt !important; }`,
  ),
  ...PARAGRAPH_SPACINGS.map(
    (value) =>
      `${block}[data-space-after="${value}"] { margin-bottom: ${value}pt !important; }`,
  ),
  ...FIRST_LINE_INDENTS.map(
    (value) =>
      `${block}[data-first-line-indent="${value}"] .bn-inline-content { text-indent: ${value}cm; }`,
  ),
].join('\n');

export const ParagraphFormattingStyle = createGlobalStyle`
  ${rules}
`;
