import { diagramBlockMapping } from '@blocknote/diagram-block/pdf-exporter';
import {
  inlineMathMapping,
  mathBlockMapping,
} from '@blocknote/math-block/pdf-exporter';
import { pdfDefaultSchemaMappings } from '@blocknote/xl-pdf-exporter';
import type { Style } from '@react-pdf/types';
import { ReactElement, ReactNode, cloneElement, isValidElement } from 'react';

import {
  fontSizePt,
  pdfFont,
} from '@/docs/doc-editor/components/custom-styles';

import {
  blockMappingCalloutPDF,
  blockMappingHeadingPDF,
  blockMappingImagePDF,
  blockMappingParagraphPDF,
  blockMappingQuotePDF,
  blockMappingTablePDF,
  blockMappingUploadLoaderPDF,
} from './blocks-mapping';
import { blockMappingSpreadsheetPDF } from './blocks-mapping/spreadsheetPDF';
import {
  inlineContentMappingFootnotePDF,
  inlineContentMappingInterlinkingLinkPDF,
} from './inline-content-mapping';
import { pdfTextFormatting } from './paragraphFormatting';
import { DocsExporterPDF } from './types';

type BlockMappingPDF = DocsExporterPDF['mappings']['blockMapping'];

/** Width of an em space in body text (12 pt). */
const EM_PT = 12;

/** Adds line spacing and first-line indent to a mapping that returns <Text>. */
const withTextFormatting = <K extends 'paragraph' | 'heading' | 'quote'>(
  mapping: BlockMappingPDF[K],
): BlockMappingPDF[K] =>
  ((block: { props: object }, ...rest: unknown[]) => {
    const element = (mapping as (...args: unknown[]) => unknown)(
      block,
      ...rest,
    );
    const { textIndent, ...style } = pdfTextFormatting(block.props);
    if (
      (!Object.keys(style).length && !textIndent) ||
      !isValidElement(element)
    ) {
      return element;
    }
    const text = element as ReactElement<{
      style?: Style | Style[];
      children?: ReactNode;
    }>;
    // react-pdf ignores textIndent when the text is split into styled runs
    // (always the case here), so the first line starts with em spaces.
    const indent =
      typeof textIndent === 'number' && textIndent > 0
        ? ' '.repeat(Math.max(1, Math.round(textIndent / EM_PT)))
        : '';
    return cloneElement(
      text,
      { style: [text.props.style ?? {}, style].flat() },
      ...(indent ? [indent] : []),
      text.props.children,
    );
  }) as unknown as BlockMappingPDF[K];

export const pdfDocsSchemaMappings: DocsExporterPDF['mappings'] = {
  ...pdfDefaultSchemaMappings,
  blockMapping: {
    ...pdfDefaultSchemaMappings.blockMapping,
    callout: blockMappingCalloutPDF,
    spreadsheet: blockMappingSpreadsheetPDF,
    heading: withTextFormatting<'heading'>(blockMappingHeadingPDF),
    image: blockMappingImagePDF,
    paragraph: withTextFormatting<'paragraph'>(blockMappingParagraphPDF),
    quote: withTextFormatting<'quote'>(blockMappingQuotePDF),
    table: blockMappingTablePDF,
    // We're using the file block mapping for PDF blocks
    // The types don't match exactly but the implementation is compatible
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdf: pdfDefaultSchemaMappings.blockMapping.file as any,
    uploadLoader: blockMappingUploadLoaderPDF,
    // Renders the LaTeX as a vector formula (via @react-pdf/math).
    mathBlock: mathBlockMapping,
    // Renders the Mermaid source to a PNG in the browser (async mapping).
    diagram: diagramBlockMapping,
  },
  inlineContentMapping: {
    ...pdfDefaultSchemaMappings.inlineContentMapping,
    interlinkingLinkInline: inlineContentMappingInterlinkingLinkPDF,
    footnote: inlineContentMappingFootnotePDF,
    // Inline math is rasterized to an image that flows with the text.
    math: inlineMathMapping,
  },
  styleMapping: {
    ...pdfDefaultSchemaMappings.styleMapping,
    // Switch to core PDF "Courier" font to avoid relying on GeistMono
    // that is not available in italics
    code: (enabled?: boolean) =>
      enabled ? { fontFamily: 'Courier', backgroundColor: '#dcdcdc' } : {},
    // PDFs only embed the standard fonts, so each family maps to its closest
    // one (serif, sans or mono).
    fontFamily: (name?: string) => {
      if (!name) {
        return {};
      }
      const font = pdfFont(name);
      return font === 'Helvetica' ? {} : { fontFamily: font };
    },
    fontSize: (size?: string) => {
      const pt = fontSizePt(size);
      return pt ? { fontSize: pt } : {};
    },
    superscript: (enabled?: boolean) =>
      enabled ? { verticalAlign: 'super' } : {},
    subscript: (enabled?: boolean) => (enabled ? { verticalAlign: 'sub' } : {}),
  },
};
