import { css } from 'styled-components';

import { Box } from '@/components';
import { CardFloatingBar, FloatingBar } from '@/components/FloatingBar';
import { KHERVE_TITLE_SLOT_ID } from '@/docs/doc-editor/components/KherveToolbar/slot';
import { FindReplace } from '@/docs/doc-find-replace/components/FindReplace';
import { useFindReplaceStore } from '@/docs/doc-find-replace/stores/useFindReplaceStore';
import { DocToolBox } from '@/docs/doc-management/components/DocToolBox';
import { useDocStore } from '@/docs/doc-management/stores/useDocStore';
import { DocShareButton } from '@/docs/doc-share/components/DocShareButton';
import { RightPanelCollapseButton } from '@/features/right-panel/components/RightPanelCollapseButton';

import { DocLeftPanelCollapseButton } from './DocLeftPanelCollapseButton';

export const DocFloatingBar = () => {
  const currentDoc = useDocStore((state) => state.currentDoc);
  const isDeletedDoc = !!currentDoc?.deleted_at;
  const isFindReplaceOpen = useFindReplaceStore((state) => state.isOpen);

  return (
    <FloatingBar>
      <DocLeftPanelCollapseButton />
      <Box
        id={KHERVE_TITLE_SLOT_ID}
        className="--docs--kherve-title-slot"
        $css={css`
          flex: 1;
          min-width: 0;
          padding: 0 12px;
          /* The title block, compacted to sit in the window's top bar. */
          .--docs--doc-header {
            min-height: 0 !important;
          }
          .--docs--doc-header > div {
            gap: 2px !important;
            padding: 0 !important;
          }
          .--docs--doc-header .--docs--horizontal-separator,
          .--docs--doc-header .--docs--doc-header-emoji-button {
            display: none !important;
          }
          .--docs--doc-title-input {
            font-size: 1.15rem !important;
            line-height: 1.35;
            white-space: nowrap;
          }
        `}
      />
      {isFindReplaceOpen ? (
        <FindReplace />
      ) : (
        <Box $direction="row" $align="center" $gap="2xs">
          {!isDeletedDoc && currentDoc && <DocShareButton doc={currentDoc} />}
          <CardFloatingBar>
            <RightPanelCollapseButton />
            {!isDeletedDoc && currentDoc && (
              <DocToolBox doc={currentDoc} isCurrentDoc={true} />
            )}
          </CardFloatingBar>
        </Box>
      )}
    </FloatingBar>
  );
};
