/**
 * KherveCELL (a Grist fork) spreadsheets, reached from the browser with the
 * user's KherveCELL session: both apps sign in through the same Keycloak,
 * and KherveCELL accepts cross-origin calls from the same host.
 */

export interface Spreadsheet {
  /** Id used in URLs (Grist's short url id when there is one). */
  id: string;
  /** Full document id; KherveCELL answers new documents with this one. */
  docId: string;
  name: string;
  updatedAt: string;
  access: string;
  workspace: string;
}

export interface SpreadsheetTable {
  id: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export class CellsAuthError extends Error {
  constructor() {
    super('Not signed in to KherveCELL');
  }
}

interface GristDoc {
  id: string;
  urlId?: string | null;
  name: string;
  updatedAt: string;
  access: string;
}

interface GristWorkspace {
  id: number;
  name: string;
  isSupportWorkspace?: boolean;
  docs: GristDoc[];
}

export const cellsFetch = async <T>(
  base: string,
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...init.headers,
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new CellsAuthError();
  }
  if (!response.ok) {
    throw new Error(`KherveCELL answered ${response.status}`);
  }
  return (await response.json()) as T;
};

const workspaces = (base: string) =>
  cellsFetch<GristWorkspace[]>(base, '/api/orgs/current/workspaces').then(
    (list) => list.filter((workspace) => !workspace.isSupportWorkspace),
  );

export const listSpreadsheets = async (base: string) => {
  const sheets: Spreadsheet[] = (await workspaces(base)).flatMap((workspace) =>
    workspace.docs.map((doc) => ({
      id: doc.urlId || doc.id,
      docId: doc.id,
      name: doc.name,
      updatedAt: doc.updatedAt,
      access: doc.access,
      workspace: workspace.name,
    })),
  );
  return sheets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const createSpreadsheet = async (base: string, name: string) => {
  const [home] = await workspaces(base);
  if (!home) {
    throw new Error('No KherveCELL workspace to create the spreadsheet in');
  }
  // Answers the new document's id.
  return cellsFetch<string>(base, `/api/workspaces/${home.id}/docs`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
};

export const listTables = (base: string, docId: string) =>
  cellsFetch<{ tables: { id: string }[] }>(
    base,
    `/api/docs/${encodeURIComponent(docId)}/tables`,
  ).then((result) => result.tables.map((table) => table.id));

interface GristColumn {
  id: string;
  fields: { label?: string; isFormula?: boolean; type?: string };
}

/** A table's visible columns (labels) and rows, for display in documents. */
export const fetchTable = async (
  base: string,
  docId: string,
  tableId: string,
  limit = 200,
): Promise<SpreadsheetTable> => {
  const doc = encodeURIComponent(docId);
  const table = encodeURIComponent(tableId);
  const [{ columns }, { records }] = await Promise.all([
    cellsFetch<{ columns: GristColumn[] }>(
      base,
      `/api/docs/${doc}/tables/${table}/columns`,
    ),
    cellsFetch<{ records: { id: number; fields: Record<string, unknown> }[] }>(
      base,
      `/api/docs/${doc}/tables/${table}/records?limit=${limit}`,
    ),
  ]);
  const visible = columns.filter(
    (column) => !column.id.startsWith('gristHelper_'),
  );
  return {
    id: tableId,
    columns: visible.map((column) => column.fields.label || column.id),
    rows: records.map((record) =>
      Object.fromEntries(
        visible.map((column) => [
          column.fields.label || column.id,
          record.fields[column.id],
        ]),
      ),
    ),
  };
};

export const spreadsheetUrl = (base: string, id: string) =>
  `${base.replace(/\/$/, '')}/${encodeURIComponent(id)}`;

export const cellsLoginUrl = (base: string, next: string) =>
  `${base.replace(/\/$/, '')}/login?next=${encodeURIComponent(next)}`;

/** A cell value as text, the way the spreadsheet would show it. */
export const cellText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    // Grist encodes lists, dates and references as ['L', ...], ['d', ts]…
    const [code, ...rest] = value as [string, ...unknown[]];
    if (code === 'L') {
      return rest.map(cellText).join(', ');
    }
    if (code === 'd' && typeof rest[0] === 'number') {
      return new Date(rest[0] * 1000).toLocaleDateString();
    }
    if (code === 'D' && typeof rest[0] === 'number') {
      return new Date(rest[0] * 1000).toLocaleString();
    }
    if (code === 'E') {
      return `#${String(rest[0] ?? 'ERROR')}`;
    }
    return rest.map(cellText).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};
