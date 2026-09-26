import {
  Block,
  BlockSchema,
  DefaultProps,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core';
import { PDFExporter } from '@blocknote/xl-pdf-exporter';
import { Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { Children, ReactElement, ReactNode, cloneElement } from 'react';

import { PageSetup } from '@/docs/doc-editor/page-setup/pageSetup';

import { footnoteRegistry } from './inline-content-mapping/footnotes';
import {
  pdfPageDecorations,
  pdfPagePadding,
  pdfPageSize,
} from './pageSetupExport';
import { pdfParagraphFormatting } from './paragraphFormatting';

/**
 * PDF exporter that applies paragraph spacing and first-line indent, and the
 * document's page setup (size, margins, header, footer, page numbers).
 */
export class KhervePDFExporter<
  B extends BlockSchema,
  S extends StyleSchema,
  I extends InlineContentSchema,
> extends PDFExporter<B, S, I> {
  /** Body line height moved from the page onto each block (see below). */
  private blockLineHeight?: number;

  protected blocknoteDefaultPropsToReactPDFStyle(
    props: Partial<DefaultProps>,
  ): Style {
    return {
      ...super.blocknoteDefaultPropsToReactPDFStyle(props),
      ...(this.blockLineHeight !== undefined && {
        lineHeight: this.blockLineHeight,
      }),
      ...pdfParagraphFormatting(props),
    };
  }

  public async toReactPDFDocumentWithPageSetup(
    blocks: Block<B, I, S>[],
    setup: PageSetup,
  ) {
    // react-pdf drops page-number (`render`) text on pages that set a line
    // height, so the body line height is applied per block instead.
    const {
      paddingHorizontal: _unused,
      lineHeight,
      ...page
    } = this.styles.page;
    if (typeof lineHeight === 'number') {
      this.blockLineHeight = lineHeight;
    }
    this.styles = {
      ...this.styles,
      page: { ...page, ...pdfPagePadding(setup) },
      // The header slot becomes a full-page layer holding header, footer and
      // page number, repeated on every page.
      header: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    } as unknown as typeof this.styles;

    const document = (await this.toReactPDFDocument(blocks, {
      header: pdfPageDecorations(setup),
    })) as ReactElement<{
      children: ReactElement<{
        size?: [number, number];
        dpi?: number;
        children?: ReactNode;
      }>;
    }>;

    // BlockNote always renders A4 at dpi 100, which scales every length by
    // 100/72. Use the document's paper size at dpi 72 so that points are
    // real points: 12 pt text, and margins and paper at their true size.
    const pdfPage = document.props.children;
    return cloneElement(
      document,
      {},
      cloneElement(
        pdfPage,
        { size: pdfPageSize(setup), dpi: 72 },
        ...Children.toArray(pdfPage.props.children),
        this.notesSection(),
      ),
    );
  }

  /** Footnotes collected while transforming, printed as endnotes. */
  private notesSection() {
    const { notes } = footnoteRegistry(this);
    if (!notes.length) {
      return null;
    }
    return (
      <View
        key="kherve-notes"
        style={{
          marginTop: 18,
          paddingTop: 6,
          borderTop: '0.5pt solid #999999',
        }}
      >
        {notes.map((note, index) => (
          <Text key={index} style={{ fontSize: 9, marginBottom: 3 }}>
            {`${index + 1}. ${note}`}
          </Text>
        ))}
      </View>
    );
  }
}
