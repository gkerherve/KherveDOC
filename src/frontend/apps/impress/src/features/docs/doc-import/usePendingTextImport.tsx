/**
 * Fills a new text document from the file chosen with "Import a file…":
 * a Word document (.docx, read with mammoth: headings, lists, tables,
 * bold/italic, links and pictures), Markdown or plain text.
 *
 * Pictures are uploaded like pasted ones. Where the server checks uploads
 * first, they go in as "analysing" blocks that turn into the picture once
 * the check is done (see UploadLoaderBlock).
 */
import { VariantType, useToastProvider } from '@gouvfr-lasuite/ui-components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ANALYZE_URL } from '@/docs/doc-editor/conf';
import type { DocsBlockNoteEditor } from '@/docs/doc-editor/types';
import { useProviderStore } from '@/docs/doc-management';

import { takePendingImport } from './pendingImport';

type AnyBlock = {
  type: string;
  props?: Record<string, unknown>;
  children?: AnyBlock[];
  [key: string]: unknown;
};

const extension = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/** Pictures waiting for the server's check become "analysing" blocks. */
const withUploadLoaders = (blocks: AnyBlock[]): AnyBlock[] =>
  blocks.map((block) => {
    const url = block.props?.url;
    if (
      block.type === 'image' &&
      typeof url === 'string' &&
      url.includes(ANALYZE_URL)
    ) {
      return {
        type: 'uploadLoader',
        props: {
          information: 'Analyzing file...',
          type: 'loading',
          blockUploadName: String(block.props?.name ?? ''),
          blockUploadType: 'image',
          blockUploadUrl: url,
          blockUploadShowPreview: true,
        },
      };
    }
    return block.children?.length
      ? { ...block, children: withUploadLoaders(block.children) }
      : block;
  });

/** A Word document as HTML, its pictures uploaded. */
export const docxToHtml = async (
  file: File,
  uploadFile: (file: File) => Promise<string>,
) => {
  const mammoth = await import('mammoth');
  let n = 0;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      // Word's own title styles, besides its headings (mapped by default).
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
      ],
      convertImage: mammoth.images.imgElement(async (image) => {
        const data = await image.readAsArrayBuffer();
        const type = image.contentType || 'image/png';
        n += 1;
        const picture = new File(
          [data],
          `picture-${n}.${type.split('/')[1] ?? 'png'}`,
          {
            type,
          },
        );
        try {
          return { src: await uploadFile(picture) };
        } catch {
          return { src: '' };
        }
      }),
    },
  );
  return result.value;
};

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c,
  );

export const usePendingTextImport = (
  editor: DocsBlockNoteEditor | undefined,
  docId: string,
  uploadFile: (file: File) => Promise<string>,
) => {
  const { t } = useTranslation();
  const { toast } = useToastProvider();
  const { isSynced } = useProviderStore();

  useEffect(() => {
    if (!editor || !isSynced) {
      return;
    }
    const file = takePendingImport(docId);
    if (!file) {
      return;
    }
    void (async () => {
      try {
        const ext = extension(file.name);
        let blocks: AnyBlock[];
        if (ext === 'docx') {
          const html = await docxToHtml(file, uploadFile);
          blocks = await editor.tryParseHTMLToBlocks(html);
        } else if (ext === 'md' || ext === 'markdown') {
          blocks = await editor.tryParseMarkdownToBlocks(await file.text());
        } else {
          const html = (await file.text())
            .split(/\r?\n/)
            .map((line) => `<p>${escapeHtml(line)}</p>`)
            .join('');
          blocks = await editor.tryParseHTMLToBlocks(html);
        }
        blocks = withUploadLoaders(blocks);
        if (blocks.length) {
          editor.replaceBlocks(editor.document, blocks as never);
        }
      } catch (error) {
        console.error(error);
        toast(
          t('The document "{{documentName}}" import has failed', {
            documentName: file.name,
          }),
          VariantType.ERROR,
        );
      }
    })();
  }, [editor, isSynced, docId, uploadFile, t, toast]);
};
