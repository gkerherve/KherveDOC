import { useTranslation } from 'react-i18next';

import { DocDefaultFilter, DocKind, Role } from '../types';

export const useTrans = () => {
  const { t } = useTranslation();

  const translatedRoles = {
    [Role.READER]: t('Reader'),
    [Role.EDITOR]: t('Editor'),
    [Role.ADMIN]: t('Administrator'),
    [Role.OWNER]: t('Owner'),
  };

  const translatedFilters = {
    [DocDefaultFilter.ALL_DOCS]: t('Recent'),
    [DocDefaultFilter.MY_DOCS]: t('My docs'),
    [DocDefaultFilter.SHARED_WITH_ME]: t('Shared with me'),
    [DocDefaultFilter.STARRED]: t('Starred'),
    [DocDefaultFilter.TRASHBIN]: t('Trashbin'),
  };

  return {
    transRole: (role: Role) => {
      return translatedRoles[role];
    },
    transFilter: (filter: DocDefaultFilter) => {
      return translatedFilters[filter];
    },
    untitledDocument: t('Untitled document'),
    /** What an item without a title is called, by kind. */
    untitledOf: (kind?: DocKind) =>
      ({
        doc: t('Untitled document'),
        sheet: t('Untitled spreadsheet'),
        slide: t('Untitled slides'),
        note: t('Untitled note'),
        folder: t('Untitled folder'),
      })[kind ?? 'doc'],
    translatedRoles,
    translatedFilters,
  };
};
