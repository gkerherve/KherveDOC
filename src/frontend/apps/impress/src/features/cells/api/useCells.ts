import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useConfig } from '@/core/config/api/useConfig';

import {
  CellsAuthError,
  createSpreadsheet,
  fetchTable,
  listSpreadsheets,
  listTables,
} from './cellsApi';

export const KEY_SPREADSHEETS = 'khervecell-spreadsheets';

/** KherveCELL's address, or undefined when spreadsheets are not set up. */
export const useCellsUrl = () => {
  const { data: config } = useConfig();
  return config?.KHERVECELL_URL || undefined;
};

const retryUnlessSignedOut = (count: number, error: Error) =>
  !(error instanceof CellsAuthError) && count < 2;

export const useSpreadsheets = () => {
  const base = useCellsUrl();
  return useQuery({
    queryKey: [KEY_SPREADSHEETS, base],
    queryFn: () => listSpreadsheets(base as string),
    enabled: !!base,
    retry: retryUnlessSignedOut,
  });
};

export const useCreateSpreadsheet = ({
  onSuccess,
}: {
  onSuccess?: (id: string) => void;
} = {}) => {
  const base = useCellsUrl();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createSpreadsheet(base as string, name),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: [KEY_SPREADSHEETS] });
      onSuccess?.(id);
    },
  });
};

export const useSpreadsheetTables = (docId?: string) => {
  const base = useCellsUrl();
  return useQuery({
    queryKey: [KEY_SPREADSHEETS, base, docId, 'tables'],
    queryFn: () => listTables(base as string, docId as string),
    enabled: !!base && !!docId,
    retry: retryUnlessSignedOut,
  });
};

/** A table's contents, refreshed so documents follow the spreadsheet. */
export const useSpreadsheetTable = (
  docId?: string,
  tableId?: string,
  refreshMs = 5000,
) => {
  const base = useCellsUrl();
  return useQuery({
    queryKey: [KEY_SPREADSHEETS, base, docId, tableId],
    queryFn: () =>
      fetchTable(base as string, docId as string, tableId as string),
    enabled: !!base && !!docId && !!tableId,
    refetchInterval: refreshMs,
    retry: retryUnlessSignedOut,
  });
};
