import { diagramBlockMapping } from '@blocknote/diagram-block/odt-exporter';
import {
  inlineMathMapping,
  mathBlockMapping,
} from '@blocknote/math-block/odt-exporter';
import { odtDefaultSchemaMappings } from '@blocknote/xl-odt-exporter';

import { isFontSize } from '@/docs/doc-editor/components/custom-styles';

import {
  blockMappingCalloutODT,
  blockMappingHeadingODT,
  blockMappingImageODT,
  blockMappingParagraphODT,
  blockMappingQuoteODT,
  blockMappingUploadLoaderODT,
} from './blocks-mapping';
import { blockMappingSpreadsheetODT } from './blocks-mapping/spreadsheetODT';
import {
  inlineContentMappingFootnoteODT,
  inlineContentMappingInterlinkingLinkODT,
} from './inline-content-mapping';
import { DocsExporterODT } from './types';

// Align default inline mappings to our editor inline schema without using `any`
const baseInlineMappings =
  odtDefaultSchemaMappings.inlineContentMapping as unknown as DocsExporterODT['mappings']['inlineContentMapping'];

export const odtDocsSchemaMappings: DocsExporterODT['mappings'] = {
  ...odtDefaultSchemaMappings,
  blockMapping: {
    ...odtDefaultSchemaMappings.blockMapping,
    paragraph: blockMappingParagraphODT,
    heading: blockMappingHeadingODT,
    quote: blockMappingQuoteODT,
    callout: blockMappingCalloutODT,
    spreadsheet: blockMappingSpreadsheetODT,
    image: blockMappingImageODT,
    // We're reusing the file block mapping for PDF blocks
    // The types don't match exactly but the implementation is compatible
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdf: odtDefaultSchemaMappings.blockMapping.file as any,
    uploadLoader: blockMappingUploadLoaderODT,
    // Renders the LaTeX as a native (editable) ODF formula object.
    mathBlock: mathBlockMapping,
    // Renders the Mermaid source to a PNG in the browser (async mapping).
    diagram: diagramBlockMapping,
  },

  inlineContentMapping: {
    ...baseInlineMappings,
    interlinkingLinkInline: inlineContentMappingInterlinkingLinkODT,
    footnote: inlineContentMappingFootnoteODT,
    // Renders inline math as a native (editable) ODF formula object.
    math: inlineMathMapping,
  },
  styleMapping: {
    ...odtDefaultSchemaMappings.styleMapping,
    fontFamily: (name?: string): Record<string, string> =>
      name ? { 'fo:font-family': name } : {},
    fontSize: (size?: string): Record<string, string> =>
      isFontSize(size) ? { 'fo:font-size': size } : {},
    superscript: (enabled?: boolean): Record<string, string> =>
      enabled ? { 'style:text-position': 'super 58%' } : {},
    subscript: (enabled?: boolean): Record<string, string> =>
      enabled ? { 'style:text-position': 'sub 58%' } : {},
  },
};
