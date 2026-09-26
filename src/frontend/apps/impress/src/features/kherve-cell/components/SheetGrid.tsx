/**
 * The spreadsheet grid: column letters, row numbers, cells, selection, the
 * in-cell editor and collaborators' cursors. Only the cells on screen are
 * drawn, so a 5,000 × 50 sheet scrolls like a small one.
 */
import {
  CSSProperties,
  KeyboardEvent,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  DEFAULT_WIDTH,
  ROW_HEIGHT,
  alignmentOf,
  columnName,
} from '../model/layout';
import type { SheetWorkbook } from '../model/workbook';

export interface CellPos {
  row: number;
  col: number;
}

export interface Selection {
  anchor: CellPos;
  focus: CellPos;
}

export interface Presence {
  clientId: number;
  name: string;
  color: string;
  row: number;
  col: number;
}

export const HEADER_HEIGHT = 24;
export const ROW_HEADER_WIDTH = 52;
const MIN_WIDTH = 24;

export const selectionRange = ({ anchor, focus }: Selection) => ({
  top: Math.min(anchor.row, focus.row),
  bottom: Math.max(anchor.row, focus.row),
  left: Math.min(anchor.col, focus.col),
  right: Math.max(anchor.col, focus.col),
});

const isNumberText = (text: string) =>
  text !== '' && !Number.isNaN(Number(text.replace(/,/g, '')));

const isErrorText = (text: string) => /^#[A-Z/0!?]+[!?A]?$/.test(text);

interface SheetGridProps {
  workbook: SheetWorkbook;
  version: number;
  sheetId: string;
  rows: number;
  cols: number;
  selection: Selection;
  editing: string | null;
  editorRef: RefObject<HTMLInputElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  presence: Presence[];
  readOnly: boolean;
  onSelect: (selection: Selection) => void;
  onStartEdit: () => void;
  onEditChange: (value: string) => void;
  onEditorKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onGridKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** Text typed while not editing (any keyboard, accents, IME, dictation). */
  onTypedText: (text: string) => void;
  /** While typing a formula, a click adds a reference instead of moving. */
  onPickReference: (pos: CellPos, extendTo?: CellPos) => void;
}

export const SheetGrid = ({
  workbook,
  version,
  sheetId,
  rows,
  cols,
  selection,
  editing,
  editorRef,
  gridRef,
  presence,
  readOnly,
  onSelect,
  onStartEdit,
  onEditChange,
  onEditorKeyDown,
  onGridKeyDown,
  onTypedText,
  onPickReference,
}: SheetGridProps) => {
  // The keyboard's target while not editing: typed text arrives here as
  // text (dead keys and input methods included), not as guessed key codes.
  const sinkRef = useRef<HTMLTextAreaElement | null>(null);
  const takeText = () => {
    const sink = sinkRef.current;
    if (sink && sink.value) {
      const text = sink.value;
      sink.value = '';
      onTypedText(text);
    }
  };
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [resizing, setResizing] = useState<{
    col: number;
    width: number;
  } | null>(null);

  // Column positions (x of each column's left edge, after the row header).
  const { lefts, widths, total } = useMemo(() => {
    const custom = workbook.customWidths(sheetId);
    const w: number[] = [];
    const l: number[] = [];
    let x = 0;
    for (let c = 0; c < cols; c++) {
      const width =
        resizing?.col === c ? resizing.width : (custom.get(c) ?? DEFAULT_WIDTH);
      l.push(x);
      w.push(width);
      x += width;
    }
    return { lefts: l, widths: w, total: x };
    // `version` changes whenever widths do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbook, sheetId, cols, version, resizing]);

  const columnAt = useCallback(
    (x: number) => {
      let lo = 0;
      let hi = cols - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lefts[mid] <= x) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return Math.max(0, Math.min(cols - 1, lo));
    },
    [lefts, cols],
  );

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() =>
      setViewport({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [gridRef]);

  const firstRow = Math.max(0, Math.floor(scroll.top / ROW_HEIGHT));
  const lastRow = Math.min(
    rows - 1,
    firstRow + Math.ceil(viewport.height / ROW_HEIGHT) + 1,
  );
  const firstCol = columnAt(scroll.left);
  const lastCol = columnAt(scroll.left + viewport.width);

  // Keep the active cell in view when it moves with the keyboard.
  const { focus } = selection;
  useEffect(() => {
    const el = gridRef.current;
    if (!el) {
      return;
    }
    const top = focus.row * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    const left = lefts[focus.col] ?? 0;
    const right = left + (widths[focus.col] ?? DEFAULT_WIDTH);
    const viewH = el.clientHeight - HEADER_HEIGHT;
    const viewW = el.clientWidth - ROW_HEADER_WIDTH;
    if (top < el.scrollTop) {
      el.scrollTop = top;
    } else if (bottom > el.scrollTop + viewH) {
      el.scrollTop = bottom - viewH;
    }
    if (left < el.scrollLeft) {
      el.scrollLeft = left;
    } else if (right > el.scrollLeft + viewW) {
      el.scrollLeft = right - viewW;
    }
  }, [focus.row, focus.col, lefts, widths, gridRef]);

  // ── Mouse ────────────────────────────────────────────────────────
  const cellAt = (event: { clientX: number; clientY: number }): CellPos => {
    const el = gridRef.current as HTMLDivElement;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left + el.scrollLeft - ROW_HEADER_WIDTH;
    const y = event.clientY - rect.top + el.scrollTop - HEADER_HEIGHT;
    return {
      row: Math.max(0, Math.min(rows - 1, Math.floor(y / ROW_HEIGHT))),
      col: columnAt(Math.max(0, x)),
    };
  };

  const dragFrom = useRef<CellPos | null>(null);

  const onCellsMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const pos = cellAt(event);
    if (editing !== null && editing.startsWith('=')) {
      // Point mode: clicking cells writes their address in the formula.
      dragFrom.current = pos;
      onPickReference(pos);
      const move = (e: MouseEvent) =>
        onPickReference(dragFrom.current as CellPos, cellAt(e));
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        editorRef.current?.focus();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      return;
    }
    const anchor = event.shiftKey ? selection.anchor : pos;
    onSelect({ anchor, focus: pos });
    gridRef.current?.focus();
    const move = (e: MouseEvent) => onSelect({ anchor, focus: cellAt(e) });
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const selectColumn = (col: number, extend: boolean) => {
    const anchorCol = extend ? selection.anchor.col : col;
    onSelect({
      anchor: { row: 0, col: anchorCol },
      focus: { row: rows - 1, col },
    });
    gridRef.current?.focus();
  };

  const selectRow = (row: number, extend: boolean) => {
    const anchorRow = extend ? selection.anchor.row : row;
    onSelect({
      anchor: { row: anchorRow, col: 0 },
      focus: { row, col: cols - 1 },
    });
    gridRef.current?.focus();
  };

  const startResize = (event: React.MouseEvent, col: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[col];
    let width = startWidth;
    const move = (e: MouseEvent) => {
      width = Math.max(MIN_WIDTH, startWidth + e.clientX - startX);
      setResizing({ col, width });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setResizing(null);
      if (!readOnly && width !== startWidth) {
        workbook.setWidth(sheetId, col, width);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── Drawing ──────────────────────────────────────────────────────
  const range = selectionRange(selection);
  const cells: React.ReactNode[] = [];
  for (let r = firstRow; r <= lastRow; r++) {
    for (let c = firstCol; c <= lastCol; c++) {
      const text = workbook.text(sheetId, r, c);
      const fmt = workbook.format(sheetId, r, c);
      if (!text && !fmt?.bg) {
        continue;
      }
      const align =
        alignmentOf(fmt?.alignment) ??
        (isErrorText(text) || text === 'TRUE' || text === 'FALSE'
          ? 'center'
          : isNumberText(text)
            ? 'right'
            : 'left');
      const style: CSSProperties = {
        left: ROW_HEADER_WIDTH + lefts[c],
        top: HEADER_HEIGHT + r * ROW_HEIGHT,
        width: widths[c],
        height: ROW_HEIGHT,
        textAlign: align,
        justifyContent:
          align === 'center' ? 'center' : align === 'right' ? 'flex-end' : '',
        fontWeight: fmt?.bold ? 700 : undefined,
        fontStyle: fmt?.italic ? 'italic' : undefined,
        textDecoration: fmt?.underline ? 'underline' : undefined,
        color: fmt?.font_color,
        background: fmt?.bg,
        fontFamily: fmt?.font_family,
        fontSize: fmt?.font_size ? `${fmt.font_size}pt` : undefined,
      };
      cells.push(
        <div key={`${r},${c}`} className="kc-cell" style={style}>
          {text}
        </div>,
      );
    }
  }

  const colHeaders: React.ReactNode[] = [];
  for (let c = firstCol; c <= lastCol; c++) {
    const selected = c >= range.left && c <= range.right;
    colHeaders.push(
      <div
        key={c}
        className={`kc-col-header${selected ? ' kc-header-selected' : ''}`}
        style={{
          left: ROW_HEADER_WIDTH + lefts[c],
          top: scroll.top,
          width: widths[c],
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          selectColumn(c, e.shiftKey);
        }}
      >
        {columnName(c)}
        <span
          className="kc-col-resize"
          onMouseDown={(e) => startResize(e, c)}
          aria-hidden
        />
      </div>,
    );
  }

  // Column lines follow the real widths; row lines are a background.
  const columnLines: React.ReactNode[] = [];
  for (let c = firstCol; c <= lastCol; c++) {
    columnLines.push(
      <div
        key={c}
        className="kc-column-line"
        style={{ left: ROW_HEADER_WIDTH + lefts[c] + widths[c] - 1 }}
      />,
    );
  }

  const rowHeaders: React.ReactNode[] = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const selected = r >= range.top && r <= range.bottom;
    rowHeaders.push(
      <div
        key={r}
        className={`kc-row-header${selected ? ' kc-header-selected' : ''}`}
        style={{
          top: HEADER_HEIGHT + r * ROW_HEIGHT,
          left: scroll.left,
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          selectRow(r, e.shiftKey);
        }}
      >
        {r + 1}
      </div>,
    );
  }

  const box = (top: number, left: number, bottom: number, right: number) => ({
    top: HEADER_HEIGHT + top * ROW_HEIGHT,
    left: ROW_HEADER_WIDTH + lefts[left],
    height: (bottom - top + 1) * ROW_HEIGHT,
    width: lefts[right] + widths[right] - lefts[left],
  });

  const active = selection.focus;

  return (
    <div
      ref={gridRef}
      className="kc-grid"
      tabIndex={0}
      role="grid"
      aria-rowcount={rows}
      aria-colcount={cols}
      onScroll={(e) =>
        setScroll({
          top: e.currentTarget.scrollTop,
          left: e.currentTarget.scrollLeft,
        })
      }
      onKeyDown={onGridKeyDown}
      onFocus={(e) => {
        if (e.target === e.currentTarget) {
          sinkRef.current?.focus({ preventScroll: true });
        }
      }}
      onDoubleClick={() => !readOnly && onStartEdit()}
    >
      <textarea
        ref={sinkRef}
        className="kc-sink"
        style={{ top: scroll.top, left: scroll.left }}
        aria-label={`${columnName(selection.focus.col)}${selection.focus.row + 1}`}
        readOnly={readOnly}
        tabIndex={-1}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onInput={(e) => {
          if (!e.nativeEvent.isComposing) {
            takeText();
          }
        }}
        onCompositionEnd={takeText}
      />
      <div
        className="kc-content"
        style={{
          width: ROW_HEADER_WIDTH + total,
          height: HEADER_HEIGHT + rows * ROW_HEIGHT,
        }}
        onMouseDown={onCellsMouseDown}
      >
        {cells}
        {columnLines}
        <div
          className="kc-selection"
          style={box(range.top, range.left, range.bottom, range.right)}
        />
        <div
          className="kc-active"
          style={box(active.row, active.col, active.row, active.col)}
        />
        {presence.map((p) =>
          p.row < rows && p.col < cols ? (
            <div
              key={p.clientId}
              className="kc-presence"
              style={{
                ...box(p.row, p.col, p.row, p.col),
                borderColor: p.color,
              }}
            >
              <span style={{ background: p.color }}>{p.name}</span>
            </div>
          ) : null,
        )}
        {editing !== null && (
          <input
            ref={editorRef}
            className="kc-editor"
            style={{
              ...box(active.row, active.col, active.row, active.col),
              minWidth: widths[active.col],
            }}
            value={editing}
            spellCheck={false}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={onEditorKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label={`${columnName(active.col)}${active.row + 1}`}
          />
        )}
      </div>
      <div className="kc-headers" aria-hidden>
        {colHeaders}
        {rowHeaders}
        <div
          className="kc-corner"
          style={{ top: scroll.top, left: scroll.left }}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect({
              anchor: { row: 0, col: 0 },
              focus: { row: rows - 1, col: cols - 1 },
            });
          }}
        />
      </div>
    </div>
  );
};

export const gridCss = `
  .kc-grid {
    position: relative;
    flex: 1;
    overflow: auto;
    outline: none;
    background: var(--c--contextuals--background--surface--primary, #fff);
    font-size: 13px;
    font-family: var(--c--globals--font--families--base, sans-serif);
    user-select: none;
  }
  .kc-content {
    position: relative;
    background-image: linear-gradient(to bottom, transparent ${ROW_HEIGHT - 1}px, #e3e5ea ${ROW_HEIGHT - 1}px);
    background-size: 100% ${ROW_HEIGHT}px;
    background-position: 0 ${HEADER_HEIGHT}px;
  }
  .kc-column-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #e3e5ea;
    pointer-events: none;
    z-index: 1;
  }
  .kc-cell {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding: 0 4px;
    white-space: nowrap;
    overflow: hidden;
    border-bottom: 1px solid #e3e5ea;
    color: var(--c--contextuals--content--semantic--neutral--primary, #222);
  }
  .kc-headers > div {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f7;
    color: #555a66;
    font-size: 12px;
    border-right: 1px solid #d6d9e0;
    border-bottom: 1px solid #d6d9e0;
    z-index: 4;
    cursor: default;
  }
  .kc-col-header { height: ${HEADER_HEIGHT}px; }
  .kc-row-header {
    width: ${ROW_HEADER_WIDTH}px;
    height: ${ROW_HEIGHT}px;
  }
  .kc-headers > .kc-header-selected {
    background: #dfe7f7;
    color: #1f4fa3;
    font-weight: 600;
  }
  .kc-headers > .kc-corner {
    width: ${ROW_HEADER_WIDTH}px;
    height: ${HEADER_HEIGHT}px;
    z-index: 5;
  }
  .kc-col-resize {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
  }
  .kc-selection {
    position: absolute;
    box-sizing: border-box;
    background: rgba(31, 79, 163, 0.08);
    border: 1px solid #1f4fa3;
    pointer-events: none;
    z-index: 2;
  }
  .kc-active {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid #1f4fa3;
    pointer-events: none;
    z-index: 3;
  }
  .kc-presence {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid;
    pointer-events: none;
    z-index: 3;
  }
  .kc-presence > span {
    position: absolute;
    top: -16px;
    left: -2px;
    padding: 0 4px;
    color: #fff;
    font-size: 10px;
    line-height: 16px;
    white-space: nowrap;
    border-radius: 3px 3px 3px 0;
  }
  .kc-sink {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    opacity: 0;
    resize: none;
    overflow: hidden;
    pointer-events: none;
  }
  .kc-editor {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid #1f4fa3;
    padding: 0 3px;
    font: inherit;
    background: #fff;
    outline: none;
    z-index: 6;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }
`;
