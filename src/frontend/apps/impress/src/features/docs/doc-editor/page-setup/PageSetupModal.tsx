import {
  Button,
  Modal,
  ModalSize,
  Select,
  Switch,
} from '@gouvfr-lasuite/ui-components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, ButtonCloseModal, Text } from '@/components';

import {
  PAPER_SIZES,
  PageNumberPosition,
  PageSetup,
  PaperSize,
  sanitizePageSetup,
} from './pageSetup';

const fieldCss = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;

  input {
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--c--contextuals--border--surface--primary);
    border-radius: 6px;
    font: inherit;
    font-weight: 400;
  }
`;

type Margin = keyof PageSetup['margins'];

export const PageSetupModal = ({
  setup,
  onSave,
  onClose,
}: {
  setup: PageSetup;
  onSave: (setup: PageSetup) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PageSetup>(setup);

  const margin = (side: Margin, label: string) => (
    <Box as="label" $css={fieldCss}>
      {label}
      <input
        type="number"
        min={0}
        max={10}
        step={0.1}
        value={draft.margins[side]}
        onChange={(e) =>
          setDraft({
            ...draft,
            margins: { ...draft.margins, [side]: Number(e.target.value) },
          })
        }
      />
    </Box>
  );

  return (
    <Modal
      isOpen
      closeOnClickOutside
      onClose={onClose}
      hideCloseButton
      size={ModalSize.MEDIUM}
      aria-labelledby="page-setup-title"
      title={
        <>
          <Text as="h1" $margin="0" id="page-setup-title" $size="h6">
            {t('Page setup')}
          </Text>
          <Box $position="absolute" $css="top: 4px; right: 4px;">
            <ButtonCloseModal aria-label={t('Close')} onClick={onClose} />
          </Box>
        </>
      }
      rightActions={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              onSave(sanitizePageSetup(draft));
              onClose();
            }}
          >
            {t('Apply')}
          </Button>
        </>
      }
    >
      <Box $gap="1rem" $margin={{ bottom: 'md' }}>
        <Box $direction="row" $gap="1rem">
          <Box $css="flex: 1;">
            <Select
              clearable={false}
              fullWidth
              label={t('Paper size')}
              value={draft.paperSize}
              options={Object.entries(PAPER_SIZES).map(([value, size]) => ({
                value,
                label: size.label,
              }))}
              onChange={(e) =>
                setDraft({ ...draft, paperSize: e.target.value as PaperSize })
              }
            />
          </Box>
          <Box $css="flex: 1;">
            <Select
              clearable={false}
              fullWidth
              label={t('Orientation')}
              value={draft.orientation}
              options={[
                { value: 'portrait', label: t('Portrait') },
                { value: 'landscape', label: t('Landscape') },
              ]}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  orientation: e.target.value as PageSetup['orientation'],
                })
              }
            />
          </Box>
        </Box>

        <Text $size="sm" $weight="bold">
          {t('Margins (cm)')}
        </Text>
        <Box
          $css={css`
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 0.75rem;
          `}
        >
          {margin('top', t('Top'))}
          {margin('bottom', t('Bottom'))}
          {margin('left', t('Left'))}
          {margin('right', t('Right'))}
        </Box>

        <Box as="label" $css={fieldCss}>
          {t('Header text (every page)')}
          <input
            type="text"
            maxLength={200}
            value={draft.header}
            placeholder={t('e.g. Short title — Author')}
            onChange={(e) => setDraft({ ...draft, header: e.target.value })}
          />
        </Box>
        <Box as="label" $css={fieldCss}>
          {t('Footer text (every page)')}
          <input
            type="text"
            maxLength={200}
            value={draft.footer}
            onChange={(e) => setDraft({ ...draft, footer: e.target.value })}
          />
        </Box>

        <Select
          clearable={false}
          fullWidth
          label={t('Page numbers')}
          value={draft.pageNumbers}
          options={[
            { value: 'none', label: t('None') },
            { value: 'bottom-center', label: t('Bottom, centred') },
            { value: 'bottom-right', label: t('Bottom, right') },
            { value: 'top-right', label: t('Top, right') },
          ]}
          onChange={(e) =>
            setDraft({
              ...draft,
              pageNumbers: e.target.value as PageNumberPosition,
            })
          }
        />

        <Switch
          label={t('Show the page while editing')}
          checked={draft.showPage}
          onChange={(e) => setDraft({ ...draft, showPage: e.target.checked })}
        />

        <Text $size="xs" $variation="secondary">
          {t(
            'Headers, footers and page numbers appear when printing and in PDF, Word and ODT exports.',
          )}
        </Text>
      </Box>
    </Modal>
  );
};
