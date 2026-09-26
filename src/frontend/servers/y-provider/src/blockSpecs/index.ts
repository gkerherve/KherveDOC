import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
  withPageBreak,
} from '@blocknote/core';

import { CalloutBlock } from './Callout';
import { FootnoteInline } from './Footnote';
import { InterlinkingLinkInline } from './InterlinkingLinkInline';
import { PdfBlock } from './Pdf';
import { SpreadsheetBlock } from './Spreadsheet';
import { UploadLoaderBlock } from './UploadLoader';
import { withParagraphProps } from './paragraphProps';
import { customStyleSpecs } from './styles';

// Must stay in sync with the frontend schema (BlockNoteEditor.tsx) so Yjs
// documents authored client-side round-trip without dropping nodes.
export const docsBlockNoteSchema = withPageBreak(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      paragraph: withParagraphProps(defaultBlockSpecs.paragraph),
      heading: withParagraphProps(defaultBlockSpecs.heading),
      quote: withParagraphProps(defaultBlockSpecs.quote),
      bulletListItem: withParagraphProps(defaultBlockSpecs.bulletListItem),
      numberedListItem: withParagraphProps(defaultBlockSpecs.numberedListItem),
      checkListItem: withParagraphProps(defaultBlockSpecs.checkListItem),
      toggleListItem: withParagraphProps(defaultBlockSpecs.toggleListItem),
      callout: CalloutBlock(),
      pdf: PdfBlock(),
      spreadsheet: SpreadsheetBlock(),
      uploadLoader: UploadLoaderBlock(),
    },
    inlineContentSpecs: {
      ...defaultInlineContentSpecs,
      interlinkingLinkInline: InterlinkingLinkInline,
      footnote: FootnoteInline,
    },
    styleSpecs: {
      ...defaultStyleSpecs,
      ...customStyleSpecs,
    },
  }),
);

export type DocsBlockSchema = typeof docsBlockNoteSchema.blockSchema;
export type DocsInlineContentSchema =
  typeof docsBlockNoteSchema.inlineContentSchema;
export type DocsStyleSchema = typeof docsBlockNoteSchema.styleSchema;
