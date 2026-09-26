import {
  BlockSchema,
  DefaultProps,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core';
import { PDFExporter } from '@blocknote/xl-pdf-exporter';
import type { Style } from '@react-pdf/types';

import { pdfParagraphFormatting } from './paragraphFormatting';

/** PDF exporter that also applies paragraph spacing and first-line indent. */
export class KhervePDFExporter<
  B extends BlockSchema,
  S extends StyleSchema,
  I extends InlineContentSchema,
> extends PDFExporter<B, S, I> {
  protected blocknoteDefaultPropsToReactPDFStyle(
    props: Partial<DefaultProps>,
  ): Style {
    return {
      ...super.blocknoteDefaultPropsToReactPDFStyle(props),
      ...pdfParagraphFormatting(props),
    };
  }
}
