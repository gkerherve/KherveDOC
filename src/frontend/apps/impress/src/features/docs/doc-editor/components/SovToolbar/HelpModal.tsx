import { Button, Modal, ModalSize } from '@gouvfr-lasuite/ui-components';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, ButtonCloseModal, Text } from '@/components';

import { MOD, SHIFT } from './parts';

export type HelpTopic = 'shortcuts' | 'about';

export const HelpModal = ({
  topic,
  onClose,
}: {
  topic: HelpTopic;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  const shortcuts: [string, string][] = [
    [`${MOD}Z`, t('Undo')],
    [`${MOD}${SHIFT}Z`, t('Redo')],
    [`${MOD}B`, t('Bold')],
    [`${MOD}I`, t('Italic')],
    [`${MOD}U`, t('Underline')],
    [`${MOD}${SHIFT}S`, t('Strikethrough')],
    [`${MOD}E`, t('Inline code')],
    [`${MOD}K`, t('Link')],
    [`${MOD}F`, t('Find and replace')],
    [`${MOD}P`, t('Print preview')],
    ['Tab', t('Increase indent')],
    [`${SHIFT}Tab`, t('Decrease indent')],
    ['/', t('Insert anything (block menu)')],
  ];

  return (
    <Modal
      isOpen
      closeOnClickOutside
      onClose={onClose}
      hideCloseButton
      size={ModalSize.MEDIUM}
      aria-labelledby="help-title"
      title={
        <>
          <Text as="h1" $margin="0" id="help-title" $size="h6">
            {topic === 'shortcuts'
              ? t('Keyboard shortcuts')
              : t('About Sovereign Office')}
          </Text>
          <Box $position="absolute" $css="top: 4px; right: 4px;">
            <ButtonCloseModal aria-label={t('Close')} onClick={onClose} />
          </Box>
        </>
      }
      rightActions={
        <Button variant="primary" fullWidth onClick={onClose}>
          {t('Close')}
        </Button>
      }
    >
      <Box $margin={{ bottom: 'md' }} $gap="0.5rem">
        {topic === 'shortcuts' ? (
          <Box
            as="dl"
            $css={css`
              display: grid;
              grid-template-columns: max-content 1fr;
              gap: 6px 20px;
              margin: 0;
              font-size: 14px;
              dt {
                font-family: monospace;
                font-weight: 600;
              }
              dd {
                margin: 0;
              }
            `}
          >
            {shortcuts.map(([keys, action]) => (
              <Box key={keys} $css="display: contents;">
                <dt>{keys}</dt>
                <dd>{action}</dd>
              </Box>
            ))}
          </Box>
        ) : (
          <>
            <Text as="p" $margin="0">
              {t(
                'Sovereign Office is a collaborative word processor built on Docs by DINUM (France) and ZenDiS (Germany), and the BlockNote editor. It is free software under the MIT licence.',
              )}
            </Text>
            <Text as="p" $margin="0" $variation="secondary" $size="sm">
              {t(
                'Your documents stay on your own server and export to open formats (ODT, PDF) as well as Word.',
              )}
            </Text>
          </>
        )}
      </Box>
    </Modal>
  );
};
