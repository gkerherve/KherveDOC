import { diagramBlockMapping } from '@blocknote/diagram-block/docx-exporter';
import {
  inlineMathMapping,
  mathBlockMapping,
} from '@blocknote/math-block/docx-exporter';
import { docxDefaultSchemaMappings } from '@blocknote/xl-docx-exporter';

import { fontSizePt } from '@/docs/doc-editor/components/custom-styles';

import {
  blockMappingBulletListItemDocx,
  blockMappingCalloutDocx,
  blockMappingCheckListItemDocx,
  blockMappingHeadingDocx,
  blockMappingImageDocx,
  blockMappingNumberedListItemDocx,
  blockMappingParagraphDocx,
  blockMappingQuoteDocx,
  blockMappingToggleListItemDocx,
  blockMappingUploadLoaderDocx,
} from './blocks-mapping';
import { blockMappingSpreadsheetDocx } from './blocks-mapping/spreadsheetDocx';
import {
  inlineContentMappingFootnoteDocx,
  inlineContentMappingInterlinkingLinkDocx,
} from './inline-content-mapping';
import { DocsExporterDocx } from './types';

export const docxDocsSchemaMappings: DocsExporterDocx['mappings'] = {
  ...docxDefaultSchemaMappings,
  blockMapping: {
    ...docxDefaultSchemaMappings.blockMapping,
    paragraph: blockMappingParagraphDocx,
    heading: blockMappingHeadingDocx,
    bulletListItem: blockMappingBulletListItemDocx,
    numberedListItem: blockMappingNumberedListItemDocx,
    checkListItem: blockMappingCheckListItemDocx,
    toggleListItem: blockMappingToggleListItemDocx,
    callout: blockMappingCalloutDocx,
    spreadsheet: blockMappingSpreadsheetDocx,
    // We're reusing the file block mapping for PDF blocks; both share the same
    // implementation signature, so we can reuse the handler directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdf: docxDefaultSchemaMappings.blockMapping.file as any,
    // Renders the LaTeX as a native (editable) Word equation.
    mathBlock: mathBlockMapping,
    // Renders the Mermaid source to a PNG in the browser (async mapping).
    diagram: diagramBlockMapping,
    quote: blockMappingQuoteDocx,
    image: blockMappingImageDocx,
    uploadLoader: blockMappingUploadLoaderDocx,
    table: (block, exporter, nestedLevel, numberedListIndex, children) => {
      /**
       * Nan values are not supported, so we need to replace them with undefined
       * to avoid issues during the export.
       */
      const { columnWidths } = block.content;
      const hasNaN = columnWidths.some(
        (width) => typeof width === 'number' && Number.isNaN(width),
      );
      if (hasNaN) {
        block.content.columnWidths = columnWidths.map((width) =>
          typeof width === 'number' && Number.isNaN(width) ? undefined : width,
        );
      }

      return docxDefaultSchemaMappings.blockMapping.table(
        block,
        exporter,
        nestedLevel,
        numberedListIndex,
        children,
      );
    },
  },
  inlineContentMapping: {
    ...docxDefaultSchemaMappings.inlineContentMapping,
    interlinkingLinkInline: inlineContentMappingInterlinkingLinkDocx,
    footnote: inlineContentMappingFootnoteDocx,
    // Renders inline math as a native (editable) Word equation.
    math: inlineMathMapping,
  },
  styleMapping: {
    ...docxDefaultSchemaMappings.styleMapping,
    // Switch to core PDF "Courier" font to avoid relying on GeistMono
    // that is not available in italics
    code: (enabled?: boolean) =>
      enabled
        ? {
            font: 'Courier New',
            shading: { fill: 'DCDCDC' },
          }
        : {},
    fontFamily: (name?: string) => (name ? { font: name } : {}),
    // Word sizes are in half-points.
    fontSize: (size?: string) => {
      const pt = fontSizePt(size);
      return pt ? { size: Math.round(pt * 2) } : {};
    },
    superscript: (enabled?: boolean) => (enabled ? { superScript: true } : {}),
    subscript: (enabled?: boolean) => (enabled ? { subScript: true } : {}),
  },
};
