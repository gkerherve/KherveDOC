import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
  withPageBreak,
} from '@blocknote/core';

import { CalloutBlock } from './Callout';
import { InterlinkingLinkInline } from './InterlinkingLinkInline';
import { PdfBlock } from './Pdf';
import { UploadLoaderBlock } from './UploadLoader';
import { customStyleSpecs } from './styles';

// Must stay in sync with the frontend schema (BlockNoteEditor.tsx) so Yjs
// documents authored client-side round-trip without dropping nodes.
export const docsBlockNoteSchema = withPageBreak(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      callout: CalloutBlock(),
      pdf: PdfBlock(),
      uploadLoader: UploadLoaderBlock(),
    },
    inlineContentSpecs: {
      ...defaultInlineContentSpecs,
      interlinkingLinkInline: InterlinkingLinkInline,
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
