import { VariantType, useToastProvider } from '@gouvfr-lasuite/ui-components';
import { t } from 'i18next';
import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';

import { setPendingImport } from '@/docs/doc-import/pendingImport';

import { createChildDoc } from '../api/useCreateChildDoc';
import { useCreateDoc } from '../api/useCreateDoc';
import { Doc, DocKind } from '../types';

interface UseImportProps {
  onDragOver?: (isDragOver: boolean) => void;
  onImportSuccess?: (doc: Doc) => void;
  /** Import into this folder (else at the top level). */
  parentId?: string;
}

interface AcceptedMap {
  [mime: string]: string[];
}

/**
 * Files KherveDOC reads in the browser (also in the desktop app, offline):
 * each becomes a new document of its kind, which reads the file once open
 * (see doc-import/).
 */
const CLIENT_TYPES: { mime: string; extensions: string[]; kind: DocKind }[] = [
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.docx'],
    kind: 'doc',
  },
  { mime: 'text/markdown', extensions: ['.md', '.markdown'], kind: 'doc' },
  { mime: 'text/plain', extensions: ['.txt'], kind: 'doc' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['.xlsx'],
    kind: 'sheet',
  },
  {
    mime: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    extensions: ['.xlsm'],
    kind: 'sheet',
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extensions: ['.pptx'],
    kind: 'slide',
  },
];

const extensionOf = (name: string) =>
  `.${name.split('.').pop()?.toLowerCase()}`;

export const kindOfFile = (name: string): DocKind | undefined =>
  CLIENT_TYPES.find((type) => type.extensions.includes(extensionOf(name)))
    ?.kind;

export const IMPORT_EXTENSIONS = CLIENT_TYPES.flatMap(
  (type) => type.extensions,
);

export const useImport = ({
  onDragOver,
  onImportSuccess,
  parentId,
}: UseImportProps) => {
  const { toast } = useToastProvider();
  const [isCreating, setIsCreating] = useState(false);
  const { mutateAsync: createDoc } = useCreateDoc();

  const ACCEPT = useMemo((): AcceptedMap => {
    const accept: AcceptedMap = {};
    for (const type of CLIENT_TYPES) {
      accept[type.mime] = [...(accept[type.mime] ?? []), ...type.extensions];
    }
    return accept;
  }, []);

  const toastInvalidFileType = useCallback(
    (fileName: string) => {
      toast(
        t(
          `The document "{{documentName}}" import has failed (only {{allowedExtensions}} files are allowed)`,
          {
            documentName: fileName,
            allowedExtensions: IMPORT_EXTENSIONS.join(', '),
          },
        ),
        VariantType.ERROR,
      );
    },
    [toast],
  );

  /**
   * A new document of the file's kind, which reads the file once open.
   * Everything is read in the browser (so also in the desktop app,
   * offline): it keeps Word headings, lists, tables and pictures.
   */
  const importInBrowser = useCallback(
    async (file: File, kind: DocKind) => {
      setIsCreating(true);
      try {
        const title = file.name.replace(/\.[^.]+$/, '');
        const doc = parentId
          ? await createChildDoc({ parentId, title, kind })
          : await createDoc({ title, kind });
        setPendingImport(doc.id, file);
        onImportSuccess?.(doc);
      } catch {
        toast(
          t('The document "{{documentName}}" import has failed', {
            documentName: file.name,
          }),
          VariantType.ERROR,
        );
      } finally {
        setIsCreating(false);
      }
    },
    [createDoc, onImportSuccess, parentId, toast],
  );

  const importFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const kind = kindOfFile(file.name);
        if (kind) {
          void importInBrowser(file, kind);
        } else {
          toastInvalidFileType(file.name);
        }
      }
    },
    [importInBrowser, toastInvalidFileType],
  );

  const { getRootProps, getInputProps, open } = useDropzone({
    accept: ACCEPT,
    onDrop(acceptedFiles) {
      onDragOver?.(false);
      importFiles(acceptedFiles);
    },
    onDragEnter: () => {
      onDragOver?.(true);
    },
    onDragLeave: () => {
      onDragOver?.(false);
    },
    onDropRejected(fileRejections) {
      fileRejections.forEach((rejection) => {
        toastInvalidFileType(rejection.file.name);
      });
    },
    noClick: true,
    noKeyboard: true,
  });

  return {
    getRootProps,
    getInputProps,
    open,
    // Word, Excel, PowerPoint and Markdown are read in the browser.
    isEnabled: true,
    isPending: isCreating,
  };
};
