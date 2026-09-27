/**
 * A folder's page: its title in the window's top bar (like a document's),
 * buttons to create a document, a spreadsheet or a folder inside it, then
 * what it holds, listed like the home screen's documents.
 */
import { Button } from '@gouvfr-lasuite/ui-components';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { InView } from 'react-intersection-observer';
import { css } from 'styled-components';

import { Box, Loading, Text } from '@/components';
import { KHERVE_TITLE_SLOT_ID } from '@/docs/doc-editor/components/SovToolbar/slot';
import { DocHeader } from '@/docs/doc-header/';
import { Doc, DocKind, FolderIcon } from '@/docs/doc-management';
import { useCreateChildDoc } from '@/docs/doc-management/api/useCreateChildDoc';
import { useImport } from '@/docs/doc-management/hooks/useImport';
import { useInfiniteDocChildren } from '@/docs/doc-tree/api/useDocChildren';
import { DocGridContentList } from '@/docs/docs-grid/components/DocGridContentList';
import { useSkeletonStore } from '@/features/skeletons';
import { NotesIcon } from '@/features/sov-notes/components/NotesIcon';
import { SpreadsheetIcon } from '@/features/sov-sheets/components/SpreadsheetIcon';
import { SlidesIcon } from '@/features/sov-slides/components/SlidesIcon';
import PlusIcon from '@/icons/doc-plus.svg';
import UploadIcon from '@/icons/upload-arrow.svg';
import { useResponsiveStore } from '@/stores';

interface FolderViewProps {
  doc: Doc;
}

export const FolderView = ({ doc }: FolderViewProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isSmallMobile, isDesktop } = useResponsiveStore();
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const { setIsSkeletonVisible } = useSkeletonStore();

  useEffect(() => {
    setTitleSlot(document.getElementById(KHERVE_TITLE_SLOT_ID));
  }, []);

  useEffect(() => {
    setIsSkeletonVisible(false);
  }, [setIsSkeletonVisible, doc.id]);

  const { data, isFetching, isLoading, fetchNextPage, hasNextPage } =
    useInfiniteDocChildren({ docId: doc.id, page_size: 50 });
  const children = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data?.pages],
  );
  const loading = isFetching || isLoading;

  const { mutate: createChild, isPending } = useCreateChildDoc({
    onSuccess: (child) => {
      // A new folder opens so it can be named; the others to be written.
      void router.push(`/docs/${child.id}`);
    },
  });
  const canCreate = doc.abilities.children_create && !doc.deleted_at;
  // Word, Excel, PowerPoint or Markdown files, into this folder.
  const { open: openImport, getInputProps } = useImport({
    parentId: doc.id,
    onImportSuccess: (child) => {
      void router.push(`/docs/${child.id}`);
    },
  });
  const create = (kind: DocKind) => {
    if (!isPending) {
      createChild({
        parentId: doc.id,
        kind,
        title: kind === 'folder' ? t('New folder') : undefined,
      });
    }
  };

  const header = <DocHeader doc={doc} />;

  return (
    <Box
      $width="100%"
      $maxWidth="960px"
      $margin={{ horizontal: 'auto' }}
      $padding={{
        horizontal: isSmallMobile ? 'xs' : 'md',
        vertical: 'md',
      }}
      $gap="md"
      className="--docs--folder-view"
    >
      {titleSlot ? createPortal(header, titleSlot) : header}
      {canCreate && (
        <Box
          $direction="row"
          $gap="sm"
          $css="flex-wrap: wrap;"
          data-testid="folder-create-buttons"
        >
          <Button
            color="brand"
            variant="secondary"
            size="small"
            icon={<PlusIcon aria-hidden="true" width={20} height={20} />}
            onClick={() => create('doc')}
          >
            {t('New document')}
          </Button>
          <Button
            color="brand"
            variant="secondary"
            size="small"
            icon={<SpreadsheetIcon size={18} />}
            onClick={() => create('sheet')}
          >
            {t('New spreadsheet')}
          </Button>
          <Button
            color="brand"
            variant="secondary"
            size="small"
            icon={<SlidesIcon size={18} />}
            onClick={() => create('slide')}
          >
            {t('New slides')}
          </Button>
          <Button
            color="brand"
            variant="secondary"
            size="small"
            icon={<NotesIcon size={18} />}
            onClick={() => create('note')}
          >
            {t('New note')}
          </Button>
          <Button
            color="brand"
            variant="secondary"
            size="small"
            icon={<FolderIcon size={18} />}
            onClick={() => create('folder')}
          >
            {t('New folder')}
          </Button>
          <Button
            color="neutral"
            variant="tertiary"
            size="small"
            icon={<UploadIcon aria-hidden="true" width={18} height={18} />}
            onClick={openImport}
          >
            {t('Import a file')}
          </Button>
          <input {...getInputProps()} />
        </Box>
      )}
      {children.length > 0 ? (
        <Box
          aria-label={t('Folder content')}
          $display="grid"
          $padding={{ horizontal: isDesktop ? 'md' : 'xs' }}
          $css={css`
            grid-template-columns: ${
              isSmallMobile
                ? 'minmax(0, 550px) auto'
                : 'minmax(0, 550px) auto auto'
            };
            column-gap: 20px;
            row-gap: 6px;
          `}
        >
          <Box role="list" $display="contents">
            <DocGridContentList docs={children} />
          </Box>
        </Box>
      ) : (
        !loading && (
          <Box
            $align="center"
            $gap="sm"
            $padding={{ vertical: 'xl' }}
            data-testid="folder-empty"
          >
            <FolderIcon size={56} />
            <Text $variation="secondary">{t('This folder is empty.')}</Text>
          </Box>
        )
      )}
      {loading && <Loading loaderProps={{ size: 'small' }} />}
      {hasNextPage && !loading && (
        <InView
          as="div"
          onChange={(inView) => inView && void fetchNextPage()}
          style={{ margin: 'auto' }}
        >
          <Button
            onClick={() => void fetchNextPage()}
            color="brand"
            variant="tertiary"
            className="sr-only"
          >
            {t('More docs')}
          </Button>
        </InView>
      )}
    </Box>
  );
};
