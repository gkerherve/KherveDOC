/**
 * This exports modules are AGPL licensed and should only
 * be used when the application is not published as MIT.
 */
import { DOCXExporter } from '@blocknote/xl-docx-exporter';
import { ODTExporter } from '@blocknote/xl-odt-exporter';
import { DocumentProps, pdf } from '@react-pdf/renderer';
import jsonemoji from 'emoji-datasource-apple' with { type: 'json' };
import i18next from 'i18next';
import { cloneElement, isValidElement } from 'react';
import { useTranslation } from 'react-i18next';

import { numberFootnotes } from '@/docs/doc-editor/components/custom-inline-content';
import {
  applyDocStyles,
  readDocStyles,
} from '@/docs/doc-editor/doc-styles/docStyles';
import { readPageSetup } from '@/docs/doc-editor/page-setup/pageSetup';
import { DocsBlockNoteEditor } from '@/docs/doc-editor/types';
import { useProviderStore } from '@/docs/doc-management';
import { Doc } from '@/docs/doc-management/types';

import { KhervePDFExporter } from '../KhervePDFExporter';
import { exportCorsResolveFileUrl } from '../api/exportResolveFileUrl';
import { footnoteRegistry } from '../inline-content-mapping/footnotes';
import { docxDocsSchemaMappings } from '../mappingDocx';
import { odtDocsSchemaMappings } from '../mappingODT';
import { pdfDocsSchemaMappings } from '../mappingPDF';
import { docxSectionOptions, odtWithPageSetup } from '../pageSetupExport';

export const useExportAGPL = (doc: Doc, editor?: DocsBlockNoteEditor) => {
  const { t } = useTranslation();

  const docToBlob = async (format: string, documentTitle: string) => {
    if (!editor) {
      return;
    }

    const ydoc = useProviderStore.getState().provider?.document;
    // editor.document is a fresh copy, so it can be rewritten for export:
    // footnotes get their numbers and document styles are baked in.
    const exportDocument = applyDocStyles(
      numberFootnotes(editor.document),
      readDocStyles(ydoc),
    );
    const pageSetup = readPageSetup(ydoc);
    let blobExport: Blob | undefined = undefined;
    if (format === 'pdf') {
      const exporter = new KhervePDFExporter(
        editor.schema,
        pdfDocsSchemaMappings,
        {
          resolveFileUrl: async (url) => exportCorsResolveFileUrl(doc.id, url),
          emojiSource: {
            format: 'png',
            builder(code) {
              const emojisFound = jsonemoji.filter(
                (e) =>
                  e.unified.split('-')[0].toLowerCase() ===
                  code.split('-')[0].toLowerCase(),
              );

              const emoji = emojisFound.find((e) =>
                e.unified.toLocaleLowerCase().includes(code.toLowerCase()),
              );

              if (emoji) {
                return `/assets/fonts/emoji/${emoji.image}`;
              }

              return '/assets/fonts/emoji/fallback.png';
            },
          },
        },
      );
      const rawPdfDocument = (await exporter.toReactPDFDocumentWithPageSetup(
        exportDocument,
        pageSetup,
      )) as React.ReactElement<DocumentProps>;

      // Add language, title and outline properties to improve PDF accessibility and navigation
      const pdfDocument = isValidElement(rawPdfDocument)
        ? cloneElement(rawPdfDocument, {
            language: i18next.language,
            title: documentTitle,
            pageMode: 'useOutlines',
          })
        : rawPdfDocument;

      blobExport = await pdf(pdfDocument).toBlob();
    } else if (format === 'docx') {
      const exporter = new DOCXExporter(editor.schema, docxDocsSchemaMappings, {
        resolveFileUrl: async (url) => exportCorsResolveFileUrl(doc.id, url),
      });

      blobExport = await exporter.toBlob(exportDocument, {
        documentOptions: {
          title: documentTitle,
          // Filled while the blocks are transformed, before the Document is built.
          footnotes: footnoteRegistry(exporter).docx,
        },
        sectionOptions: docxSectionOptions(pageSetup),
      });
    } else if (format === 'odt') {
      const exporter = new ODTExporter(editor.schema, odtDocsSchemaMappings, {
        resolveFileUrl: async (url) => exportCorsResolveFileUrl(doc.id, url),
      });

      blobExport = await odtWithPageSetup(
        await exporter.toODTDocument(exportDocument),
        pageSetup,
      );
    }

    return blobExport;
  };

  return {
    formats: [
      { label: t('PDF'), value: 'pdf', labelDescription: t('.pdf') },
      { label: t('Docx'), value: 'docx', labelDescription: t('.docx') },
      { label: t('ODT'), value: 'odt', labelDescription: t('.odt') },
    ],
    docToBlob,
  };
};
