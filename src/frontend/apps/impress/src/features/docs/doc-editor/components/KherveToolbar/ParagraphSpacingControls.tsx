import { useTranslation } from 'react-i18next';

import { DropdownMenu, DropdownMenuOption, Icon } from '@/components';

import {
  FIRST_LINE_INDENTS,
  LINE_SPACINGS,
  PARAGRAPH_SPACINGS,
  ParagraphProps,
} from '../custom-blocks/paragraphProps';

import { DropdownTrigger } from './parts';

type Current = Required<Omit<ParagraphProps, 'styleName'>>;

export const ParagraphSpacingControls = ({
  disabled,
  current,
  onChange,
}: {
  disabled: boolean;
  current: Current;
  onChange: (props: ParagraphProps) => void;
}) => {
  const { t } = useTranslation();

  const lineOptions: DropdownMenuOption[] = [
    {
      label: t('Default'),
      isSelected: current.lineSpacing === 'default',
      showSeparator: true,
      callback: () => onChange({ lineSpacing: 'default' }),
    },
    ...LINE_SPACINGS.map((value) => ({
      label: Number(value).toFixed(value.length > 3 ? 2 : 1),
      isSelected: current.lineSpacing === value,
      callback: () => onChange({ lineSpacing: value }),
    })),
  ];

  const spacingOptions = (
    key: 'spaceBefore' | 'spaceAfter',
    title: string,
  ): DropdownMenuOption[] => [
    {
      label: `${title}: ${t('default')}`,
      isSelected: current[key] === 'default',
      callback: () => onChange({ [key]: 'default' }),
    },
    ...PARAGRAPH_SPACINGS.map((value, index) => ({
      label: `${title}: ${value} pt`,
      isSelected: current[key] === value,
      showSeparator: index === PARAGRAPH_SPACINGS.length - 1,
      callback: () => onChange({ [key]: value }),
    })),
  ];

  const indentOptions: DropdownMenuOption[] = [
    {
      label: t('Default'),
      isSelected: current.firstLineIndent === 'default',
      showSeparator: true,
      callback: () => onChange({ firstLineIndent: 'default' }),
    },
    ...FIRST_LINE_INDENTS.map((value) => ({
      label: value === '0' ? t('None') : `${value} cm`,
      isSelected: current.firstLineIndent === value,
      callback: () => onChange({ firstLineIndent: value }),
    })),
  ];

  return (
    <>
      <DropdownMenu
        label={t('Line spacing')}
        options={lineOptions}
        disabled={disabled}
      >
        <DropdownTrigger label={t('Line spacing')}>
          <Icon iconName="format_line_spacing" $size="20px" $theme="inherit" />
        </DropdownTrigger>
      </DropdownMenu>
      <DropdownMenu
        label={t('Paragraph spacing')}
        options={[
          ...spacingOptions('spaceBefore', t('Above')),
          ...spacingOptions('spaceAfter', t('Below')),
        ]}
        disabled={disabled}
      >
        <DropdownTrigger label={t('Paragraph spacing')}>
          <Icon iconName="expand" $size="20px" $theme="inherit" />
        </DropdownTrigger>
      </DropdownMenu>
      <DropdownMenu
        label={t('First-line indent')}
        options={indentOptions}
        disabled={disabled}
      >
        <DropdownTrigger label={t('First-line indent')}>
          <Icon
            iconName="format_indent_increase"
            $size="20px"
            $theme="inherit"
          />
          <span style={{ fontSize: 11, marginLeft: -4 }}>1</span>
        </DropdownTrigger>
      </DropdownMenu>
    </>
  );
};
