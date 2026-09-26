import { Paragraph } from 'docx';

import { docxParagraphFormatting } from '../paragraphFormatting';
import { DocsExporterDocx } from '../types';
import { docxBlockPropsToStyles } from '../utils';

export const blockMappingQuoteDocx: DocsExporterDocx['mappings']['blockMapping']['quote'] =
  (block, exporter) => {
    if (Array.isArray(block.content)) {
      block.content.forEach((content) => {
        if (content.type === 'text') {
          if (
            'styles' in content &&
            typeof content.styles === 'object' &&
            content.styles !== null
          ) {
            content.styles = {
              ...content.styles,
              italic: true,
              textColor: 'gray',
            };
          }
        }
      });
    }

    return new Paragraph({
      ...docxBlockPropsToStyles(block.props, exporter.options.colors),
      ...docxParagraphFormatting(block.props),
      spacing: {
        before: 10,
        after: 10,
        ...docxParagraphFormatting(block.props).spacing,
      },
      border: {
        left: {
          color: '#cecece',
          space: 4,
          style: 'thick',
        },
      },
      style: 'Normal',
      children: exporter.transformInlineContent(block.content),
    });
  };
