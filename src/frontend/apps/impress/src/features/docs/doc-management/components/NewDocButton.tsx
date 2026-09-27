import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  Loader,
} from '@gouvfr-lasuite/ui-components';
import { useRouter } from 'next/router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components';
import { useLeftPanelStore } from '@/features/left-panel/stores/useLeftPanelStore';
import { ChatIcon } from '@/features/sov-chat/components/ChatIcon';
import { MeetIcon } from '@/features/sov-meet/components/MeetIcon';
import { NotesIcon } from '@/features/sov-notes/components/NotesIcon';
import { SpreadsheetIcon } from '@/features/sov-sheets/components/SpreadsheetIcon';
import { SlidesIcon } from '@/features/sov-slides/components/SlidesIcon';
import ArrowDownIcon from '@/icons/arrow-drop-down.svg';
import SubDocIcon from '@/icons/doc-new-subdoc.svg';
import PlusIcon from '@/icons/doc-plus.svg';
import UploadIcon from '@/icons/upload-arrow.svg';
import { useResponsiveStore } from '@/stores/useResponsiveStore';

import { useAddExamples } from '../api/useAddExamples';
import { useCreateChildDoc } from '../api/useCreateChildDoc';
import { useImport } from '../hooks/useImport';
import { useDocStore } from '../stores/useDocStore';

import { FolderIcon } from './FolderIcon';

interface NewDocButtonProps {
  onClose?: () => void;
}

export const NewDocButton = ({ onClose }: NewDocButtonProps) => {
  const router = useRouter();
  const { t } = useTranslation();
  // Always: the menu offers a spreadsheet besides a document.
  const isDropdownEnabled = true;

  return (
    <>
      <Button
        href="/docs/new"
        data-testid="new-doc-button"
        color="brand"
        onClick={(e) => {
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            void router.push('/docs/new');
          }
          onClose?.();
        }}
        icon={<PlusIcon aria-hidden="true" width={24} height={24} />}
        style={{
          borderRadius: isDropdownEnabled ? '4px 0 0 4px' : '4px',
          borderRight:
            '1px solid var(--c--contextuals--background--palette--brand--primary)',
        }}
      >
        <Text $withThemeInherited $size="md" $weight="500">
          {t('New')}
        </Text>
      </Button>
      {isDropdownEnabled && <DropdownArrow />}
    </>
  );
};

export function DropdownArrow() {
  const { isMobile } = useResponsiveStore();
  const { closePanel } = useLeftPanelStore();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { currentDoc } = useDocStore();
  const { t } = useTranslation();
  const {
    getInputProps,
    open: openImport,
    isPending: isImportPending,
    isEnabled: isImportEnabled,
  } = useImport({
    onImportSuccess: (doc) => {
      void router.push(`/docs/${doc.id}/`);
      if (isMobile) {
        closePanel();
      }
    },
  });
  const { mutate: createChildDoc } = useCreateChildDoc({
    onSuccess: (newDoc) => {
      void router.push(`/docs/${newDoc.id}`);
      if (isMobile) {
        closePanel();
      }
    },
  });

  const { mutate: addExamples } = useAddExamples({
    onSuccess: (id) => {
      void router.push(`/docs/${id}`);
      if (isMobile) {
        closePanel();
      }
    },
  });

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((open) => !open);
  }, []);

  const options = useMemo<DropdownMenuItem[]>(
    () => [
      {
        label: t('New document'),
        icon: <PlusIcon aria-hidden="true" width="24" height="24" />,
        callback: () => {
          void router.push('/docs/new');
          if (isMobile) {
            closePanel();
          }
        },
      },
      {
        label: t('New sub-doc'),
        icon: <SubDocIcon aria-hidden="true" width="24" height="24" />,
        callback: () => {
          if (currentDoc) {
            createChildDoc({
              parentId: currentDoc.id,
            });
          }
        },
        isHidden: !currentDoc,
      },
      {
        label: t('New spreadsheet'),
        icon: <SpreadsheetIcon />,
        callback: () => {
          void router.push('/docs/new?kind=sheet');
          if (isMobile) {
            closePanel();
          }
        },
      },
      {
        label: t('New slides'),
        icon: <SlidesIcon />,
        callback: () => {
          void router.push('/docs/new?kind=slide');
          if (isMobile) {
            closePanel();
          }
        },
      },
      {
        label: t('New note'),
        icon: <NotesIcon />,
        callback: () => {
          void router.push('/docs/new?kind=note');
          if (isMobile) {
            closePanel();
          }
        },
      },
      {
        label: t('New chat'),
        icon: <ChatIcon />,
        callback: () => {
          void router.push('/docs/new?kind=chat');
          if (isMobile) {
            closePanel();
          }
        },
      },
      {
        label: t('New meeting'),
        icon: <MeetIcon />,
        callback: () => {
          void router.push('/docs/new?kind=meet');
          if (isMobile) {
            closePanel();
          }
        },
      },
      {
        label: t('New folder'),
        icon: <FolderIcon />,
        callback: () => {
          void router.push('/docs/new?kind=folder');
          if (isMobile) {
            closePanel();
          }
        },
      },
      {
        label: t('Import a document'),
        icon: <UploadIcon aria-hidden="true" width="24" height="24" />,
        callback: openImport,
        isHidden: !isImportEnabled || !!currentDoc,
      },
      {
        label: t('Add the examples folder'),
        icon: <FolderIcon />,
        callback: () => addExamples(),
        isHidden: !!currentDoc,
      },
    ],
    [
      t,
      openImport,
      currentDoc,
      createChildDoc,
      isImportEnabled,
      addExamples,
      router,
      isMobile,
      closePanel,
    ],
  );

  return (
    <>
      <DropdownMenu
        options={options}
        isOpen={isMenuOpen}
        onOpenChange={setIsMenuOpen}
      >
        <Button
          aria-label={t('Open new document options')}
          color="brand"
          variant="primary"
          iconPosition="left"
          icon={
            isImportPending ? (
              <Loader size="small" />
            ) : (
              <ArrowDownIcon aria-hidden="true" width="24" height="24" />
            )
          }
          onClick={!isImportPending ? toggleMenu : undefined}
          aria-disabled={isImportPending}
          style={{ borderRadius: '0 4px 4px 0', width: '30px' }}
        />
      </DropdownMenu>
      <input {...getInputProps()} />
    </>
  );
}
