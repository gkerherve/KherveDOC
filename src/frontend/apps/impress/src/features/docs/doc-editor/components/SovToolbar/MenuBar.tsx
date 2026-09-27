import { css } from 'styled-components';

import { Box, DropdownMenu, DropdownMenuOption } from '@/components';

export interface Menu {
  /** Language-independent name: file, edit, view, insert, format… */
  key: string;
  label: string;
  options: DropdownMenuOption[];
}

const menuTriggerCss = css`
  padding: 3px 9px;
  border-radius: 4px;
  font-size: 13.5px;
  color: var(--c--contextuals--content--semantic--neutral--primary);
  &:hover {
    background: var(--c--contextuals--background--semantic--neutral--tertiary);
  }
`;

/** File, Edit, View… menus, like a desktop word processor. */
export const MenuBar = ({ menus }: { menus: Menu[] }) => (
  <Box
    role="menubar"
    $direction="row"
    $align="center"
    $gap="2px"
    $css="margin-left: -6px;"
  >
    {menus.map((menu) => (
      <DropdownMenu key={menu.key} label={menu.label} options={menu.options}>
        <Box as="span" $css={menuTriggerCss}>
          {menu.label}
        </Box>
      </DropdownMenu>
    ))}
  </Box>
);
