import { createBlockSpec } from '@blocknote/core';

// Mirrors the frontend's SpreadsheetBlock (a SOV Sheets table): the server
// only needs the props, and renders the stored copy for HTML conversion.
const spreadsheetConfig = {
  type: 'spreadsheet' as const,
  propSchema: {
    docId: { default: '' as string },
    tableId: { default: '' as string },
    name: { default: '' as string },
    snapshot: { default: '' as string },
  },
  content: 'none' as const,
};

const buildSpreadsheetDom = (block: {
  props: { name: string; snapshot: string };
}) => {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-content-type', 'spreadsheet');
  let snapshot: { columns?: unknown[]; rows?: unknown[][] } | undefined;
  try {
    snapshot = block.props.snapshot
      ? (JSON.parse(block.props.snapshot) as typeof snapshot)
      : undefined;
  } catch {
    snapshot = undefined;
  }
  if (!snapshot || !Array.isArray(snapshot.columns)) {
    wrapper.textContent = block.props.name;
    return wrapper;
  }
  const table = document.createElement('table');
  if (block.props.name) {
    const caption = document.createElement('caption');
    caption.textContent = block.props.name;
    table.appendChild(caption);
  }
  const head = document.createElement('tr');
  for (const column of snapshot.columns) {
    const th = document.createElement('th');
    th.textContent = String(column);
    head.appendChild(th);
  }
  table.appendChild(head);
  for (const row of Array.isArray(snapshot.rows) ? snapshot.rows : []) {
    const tr = document.createElement('tr');
    for (const value of Array.isArray(row) ? row : []) {
      const td = document.createElement('td');
      td.textContent = String(value ?? '');
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  wrapper.appendChild(table);
  return wrapper;
};

export const SpreadsheetBlock = createBlockSpec(spreadsheetConfig, {
  render: (block) => ({ dom: buildSpreadsheetDom(block) }),
  toExternalHTML: (block) => ({ dom: buildSpreadsheetDom(block) }),
});
