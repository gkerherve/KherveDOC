/**
 * The home screen's folders, under Recent: each opens the folder's page,
 * and "+" makes a new one (folders nest, as deep as one likes, from there).
 */
import { Button } from '@gouvfr-lasuite/ui-components';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, StyledLink, Text } from '@/components';
import { FolderIcon, useDocs, useTrans } from '@/docs/doc-management';
import { useAddExamples } from '@/docs/doc-management/api/useAddExamples';
import { useLeftPanelStore } from '@/features/left-panel/stores/useLeftPanelStore';
import PlusIcon from '@/icons/doc-plus.svg';
import { useResponsiveStore } from '@/stores/useResponsiveStore';

export const LeftPanelFolders = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isMobile } = useResponsiveStore();
  const { closePanel } = useLeftPanelStore();
  const { untitledOf } = useTrans();
  const { data } = useDocs({ page: 1, kind: 'folder', ordering: 'title' });
  const folders = data?.results ?? [];
  const { mutate: addExamples, isPending } = useAddExamples({
    onSuccess: (id) => {
      void router.push(`/docs/${id}`);
    },
  });

  const onOpen = () => {
    if (isMobile) {
      closePanel();
    }
  };

  return (
    <Box
      $padding={{ horizontal: 'sm' }}
      $gap="2xs"
      className="--docs--left-panel-folders"
    >
      <Box
        $direction="row"
        $align="center"
        $justify="space-between"
        $padding={{ left: '2xs' }}
      >
        <Text $size="xs" $weight="600" $variation="secondary">
          {t('Folders')}
        </Text>
        <Button
          size="nano"
          color="neutral"
          variant="tertiary"
          aria-label={t('New folder')}
          title={t('New folder')}
          data-testid="left-panel-new-folder"
          icon={<PlusIcon aria-hidden="true" width={18} height={18} />}
          onClick={() => {
            void router.push('/docs/new?kind=folder');
            onOpen();
          }}
        />
      </Box>
      {data && folders.length === 0 && (
        <Button
          size="small"
          color="neutral"
          variant="tertiary"
          disabled={isPending}
          data-testid="left-panel-add-examples"
          icon={<FolderIcon size={18} />}
          onClick={() => addExamples()}
        >
          {t('Add the examples folder')}
        </Button>
      )}
      {folders.map((folder) => (
        <StyledLink
          key={folder.id}
          href={`/docs/${folder.id}`}
          onClick={onOpen}
          $css={css`
            align-items: center;
            gap: var(--c--globals--spacings--3xs);
            padding: var(--c--globals--spacings--2xs);
            border-radius: var(--c--globals--spacings--3xs);
            color: inherit;
            text-decoration: none;
            &:hover {
              background-color: var(
                --c--contextuals--background--semantic--contextual--primary
              );
            }
          `}
        >
          <FolderIcon size={20} />
          <Text
            $size="sm"
            $css="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
          >
            {folder.title || untitledOf('folder')}
          </Text>
        </StyledLink>
      ))}
    </Box>
  );
};
