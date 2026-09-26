/**
 * The spreadsheet grid: column letters, row numbers, cells, selection, the
 * fill handle, the in-cell editor, frozen panes and collaborators' cursors.
 * Only the cells on screen are drawn, so a 5,000 × 50 sheet scrolls like a
 * small one.
 *
 * Frozen rows and columns are separate layers ("panes") pinned to the
 * scroll position; everything else scrolls underneath them.
 */
import {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
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

export interface Range {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Presence {
  clientId: number;
  name: string;
  color: string;
  row: number;
  col: number;
}

export type ContextTarget = 'cell' | 'row' | 'col';

export const HEADER_HEIGHT = 24;
export const ROW_HEADER_WIDTH = 52;
const MIN_WIDTH = 24;

export const selectionRange = ({ anchor, focus }: Selection): Range => ({
  top: Math.min(anchor.row, focus.row),
  bottom: Math.max(anchor.row, focus.row),
  left: Math.min(anchor.col, focus.col),
  right: Math.max(anchor.col, focus.col),
});

const inRange = (r: Range, row: number, col: number) =>
  row >= r.top && row <= r.bottom && col >= r.left && col <= r.right;

const isNumberText = (text: string) =>
  text !== '' && !Number.isNaN(Number(text.replace(/,/g, '')));

const isErrorText = (text: string) => /^#[A-Z/0!?]+[!?A]?$/.test(text);

interface SheetGridProps {
  workbook: SheetWorkbook;
  version: number;
  sheetId: string;
  rows: number;
  cols: number;
  freezeRows: number;
  freezeCols: number;
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
  /** The fill handle was dragged from *source* over *target*. */
  onFill: (source: Range, target: Range) => void;
  onContextMenu: (x: number, y: number, target: ContextTarget) => void;
}

export const SheetGrid = ({
  workbook,
  version,
  sheetId,
  rows,
  cols,
  freezeRows,
  freezeCols,
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
  onFill,
  onContextMenu,
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
  const [fillPreview, setFillPreview] = useState<Range | null>(null);

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

  const fr = Math.min(freezeRows, rows);
  const fc = Math.min(freezeCols, cols);
  const frozenH = fr * ROW_HEIGHT;
  const frozenW = fc > 0 ? lefts[fc - 1] + widths[fc - 1] : 0;

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

  // Scrolling rows/columns on screen (frozen ones are always drawn).
  const firstRow = Math.max(
    fr,
    Math.floor((scroll.top + frozenH) / ROW_HEIGHT),
  );
  const lastRow = Math.min(
    rows - 1,
    firstRow + Math.ceil(viewport.height / ROW_HEIGHT) + 1,
  );
  const firstCol = Math.max(fc, columnAt(scroll.left + frozenW));
  const lastCol = columnAt(scroll.left + viewport.width);

  // Keep the active cell in view when it moves with the keyboard.
  const { focus } = selection;
  useEffect(() => {
    const el = gridRef.current;
    if (!el) {
      return;
    }
    if (focus.row >= fr) {
      const top = focus.row * ROW_HEIGHT - frozenH;
      const bottom = focus.row * ROW_HEIGHT + ROW_HEIGHT;
      const viewH = el.clientHeight - HEADER_HEIGHT;
      if (top < el.scrollTop) {
        el.scrollTop = top;
      } else if (bottom > el.scrollTop + viewH) {
        el.scrollTop = bottom - viewH;
      }
    }
    if (focus.col >= fc) {
      const left = (lefts[focus.col] ?? 0) - frozenW;
      const right =
        (lefts[focus.col] ?? 0) + (widths[focus.col] ?? DEFAULT_WIDTH);
      const viewW = el.clientWidth - ROW_HEADER_WIDTH;
      if (left < el.scrollLeft) {
        el.scrollLeft = left;
      } else if (right > el.scrollLeft + viewW) {
        el.scrollLeft = right - viewW;
      }
    }
  }, [focus.row, focus.col, lefts, widths, gridRef, fr, fc, frozenH, frozenW]);

  // ── Geometry ─────────────────────────────────────────────────────
  /** Content coordinates of a cell's top-left corner (panes included). */
  const cellX = (c: number) =>
    ROW_HEADER_WIDTH + lefts[c] + (c < fc ? scroll.left : 0);
  const cellY = (r: number) =>
    HEADER_HEIGHT + r * ROW_HEIGHT + (r < fr ? scroll.top : 0);

  const box = (r: Range): CSSProperties => {
    const left = cellX(r.left);
    const top = cellY(r.top);
    return {
      top,
      left,
      height: cellY(r.bottom) + ROW_HEIGHT - top,
      width: cellX(r.right) + widths[r.right] - left,
      // Boxes that start in a frozen pane must be drawn above it.
      zIndex: r.top < fr || r.left < fc ? 7 : undefined,
    };
  };

  const cellAt = (event: { clientX: number; clientY: number }): CellPos => {
    const el = gridRef.current as HTMLDivElement;
    const rect = el.getBoundingClientRect();
    const xv = event.clientX - rect.left - ROW_HEADER_WIDTH;
    const yv = event.clientY - rect.top - HEADER_HEIGHT;
    const y = yv < frozenH ? yv : yv + el.scrollTop;
    const x = xv < frozenW ? xv : xv + el.scrollLeft;
    return {
      row: Math.max(0, Math.min(rows - 1, Math.floor(y / ROW_HEIGHT))),
      col: columnAt(Math.max(0, x)),
    };
  };

  // ── Mouse ────────────────────────────────────────────────────────
  const drag = (
    onMove: (e: MouseEvent) => void,
    onUp?: (e: MouseEvent) => void,
  ) => {
    const up = (e: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', up);
      onUp?.(e);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', up);
  };

  const range = selectionRange(selection);

  const onCellsMouseDown = (event: ReactMouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const pos = cellAt(event);
    if (editing !== null && editing.startsWith('=')) {
      // Point mode: clicking cells writes their address in the formula.
      onPickReference(pos);
      drag(
        (e) => onPickReference(pos, cellAt(e)),
        () => editorRef.current?.focus(),
      );
      return;
    }
    const anchor = event.shiftKey ? selection.anchor : pos;
    onSelect({ anchor, focus: pos });
    gridRef.current?.focus();
    drag((e) => onSelect({ anchor, focus: cellAt(e) }));
  };

  const onFillMouseDown = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const source = range;
    const extend = (e: MouseEvent): Range => {
      const pos = cellAt(e);
      // Fill along the axis the mouse moved furthest, like Excel.
      const down = pos.row - source.bottom;
      const up = source.top - pos.row;
      const right = pos.col - source.right;
      const left = source.left - pos.col;
      const best = Math.max(down, up, right, left);
      if (best <= 0) {
        return source;
      }
      if (best === down) {
        return { ...source, bottom: pos.row };
      }
      if (best === up) {
        return { ...source, top: pos.row };
      }
      if (best === right) {
        return { ...source, right: pos.col };
      }
      return { ...source, left: pos.col };
    };
    drag(
      (e) => setFillPreview(extend(e)),
      (e) => {
        setFillPreview(null);
        const target = extend(e);
        if (
          target.top !== source.top ||
          target.bottom !== source.bottom ||
          target.left !== source.left ||
          target.right !== source.right
        ) {
          onFill(source, target);
        }
        gridRef.current?.focus();
      },
    );
  };

  const onRightClick = (event: ReactMouseEvent, target: ContextTarget) => {
    event.preventDefault();
    if (target === 'cell') {
      const pos = cellAt(event);
      if (!inRange(range, pos.row, pos.col)) {
        onSelect({ anchor: pos, focus: pos });
      }
    }
    onContextMenu(event.clientX, event.clientY, target);
  };

  const selectColumn = (col: number, extend: boolean) => {
    // The active cell stays at the top of the column, as in Excel.
    const anchorCol = extend ? selection.anchor.col : col;
    onSelect({
      anchor: { row: rows - 1, col: anchorCol },
      focus: { row: 0, col },
    });
    gridRef.current?.focus();
  };

  const selectRow = (row: number, extend: boolean) => {
    // The active cell stays at the start of the row, as in Excel.
    const anchorRow = extend ? selection.anchor.row : row;
    onSelect({
      anchor: { row: anchorRow, col: cols - 1 },
      focus: { row, col: 0 },
    });
    gridRef.current?.focus();
  };

  const startResize = (event: ReactMouseEvent, col: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[col];
    let width = startWidth;
    drag(
      (e) => {
        width = Math.max(MIN_WIDTH, startWidth + e.clientX - startX);
        setResizing({ col, width });
      },
      () => {
        setResizing(null);
        if (!readOnly && width !== startWidth) {
          workbook.setWidth(sheetId, col, width);
        }
      },
    );
  };

  // ── Drawing ──────────────────────────────────────────────────────
  const cell = (r: number, c: number, left: number, top: number) => {
    const text = workbook.text(sheetId, r, c);
    const fmt = workbook.format(sheetId, r, c);
    if (!text && !fmt?.bg) {
      return null;
    }
    const align =
      alignmentOf(fmt?.alignment) ??
      (isErrorText(text) || text === 'TRUE' || text === 'FALSE'
        ? 'center'
        : isNumberText(text)
          ? 'right'
          : 'left');
    const style: CSSProperties = {
      left,
      top,
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
    return (
      <div key={`${r},${c}`} className="kc-cell" style={style}>
        {text}
      </div>
    );
  };

  const columnLine = (c: number, left: number) => (
    <div
      key={`line${c}`}
      className="kc-column-line"
      style={{ left: left + widths[c] - 1 }}
    />
  );

  // Scrolling area.
  const cells: React.ReactNode[] = [];
  for (let r = firstRow; r <= lastRow; r++) {
    for (let c = firstCol; c <= lastCol; c++) {
      cells.push(
        cell(r, c, ROW_HEADER_WIDTH + lefts[c], HEADER_HEIGHT + r * ROW_HEIGHT),
      );
    }
  }
  const lines: React.ReactNode[] = [];
  for (let c = firstCol; c <= lastCol; c++) {
    lines.push(columnLine(c, ROW_HEADER_WIDTH + lefts[c]));
  }

  // Frozen panes: coordinates inside each pane.
  const paneCells = (
    rowList: number[],
    colList: number[],
    colOffset: number,
  ) => {
    const out: React.ReactNode[] = [];
    for (const r of rowList) {
      for (const c of colList) {
        out.push(cell(r, c, lefts[c] - colOffset, r * ROW_HEIGHT));
      }
    }
    for (const c of colList) {
      out.push(columnLine(c, lefts[c] - colOffset));
    }
    return out;
  };
  const range0 = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  const frozenRowList = range0(0, fr - 1);
  const frozenColList = range0(0, fc - 1);
  const visibleRowList = range0(firstRow, lastRow);
  const visibleColList = range0(firstCol, lastCol);

  const colHeaders: React.ReactNode[] = [];
  for (const c of [...frozenColList, ...visibleColList]) {
    const selected = c >= range.left && c <= range.right;
    colHeaders.push(
      <div
        key={c}
        className={`kc-col-header${selected ? ' kc-header-selected' : ''}${c < fc ? ' kc-header-frozen' : ''}`}
        style={{ left: cellX(c), top: scroll.top, width: widths[c] }}
        onMouseDown={(e) => {
          if (e.button === 0) {
            e.preventDefault();
            selectColumn(c, e.shiftKey);
          }
        }}
        onContextMenu={(e) => {
          if (!(
            c >= range.left &&
            c <= range.right &&
            range.top === 0 &&
            range.bottom === rows - 1
          )) {
            selectColumn(c, false);
          }
          onRightClick(e, 'col');
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

  const rowHeaders: React.ReactNode[] = [];
  for (const r of [...frozenRowList, ...visibleRowList]) {
    const selected = r >= range.top && r <= range.bottom;
    rowHeaders.push(
      <div
        key={r}
        className={`kc-row-header${selected ? ' kc-header-selected' : ''}${r < fr ? ' kc-header-frozen' : ''}`}
        style={{ top: cellY(r), left: scroll.left }}
        onMouseDown={(e) => {
          if (e.button === 0) {
            e.preventDefault();
            selectRow(r, e.shiftKey);
          }
        }}
        onContextMenu={(e) => {
          if (!(
            r >= range.top &&
            r <= range.bottom &&
            range.left === 0 &&
            range.right === cols - 1
          )) {
            selectRow(r, false);
          }
          onRightClick(e, 'row');
        }}
      >
        {r + 1}
      </div>,
    );
  }

  const active = selection.focus;
  const activeRange = {
    top: active.row,
    bottom: active.row,
    left: active.col,
    right: active.col,
  };
  const selBox = box(range);

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
        onContextMenu={(e) => onRightClick(e, 'cell')}
      >
        {cells}
        {lines}
        {fr > 0 && (
          <div
            className="kc-pane kc-pane-rows"
            style={{
              top: HEADER_HEIGHT + scroll.top,
              left: ROW_HEADER_WIDTH,
              width: total,
              height: frozenH,
            }}
          >
            {paneCells(frozenRowList, visibleColList, 0)}
          </div>
        )}
        {fc > 0 && (
          <div
            className="kc-pane kc-pane-cols"
            style={{
              top: HEADER_HEIGHT,
              left: ROW_HEADER_WIDTH + scroll.left,
              width: frozenW,
              height: rows * ROW_HEIGHT,
            }}
          >
            {paneCells(visibleRowList, frozenColList, 0)}
          </div>
        )}
        {fr > 0 && fc > 0 && (
          <div
            className="kc-pane kc-pane-corner"
            style={{
              top: HEADER_HEIGHT + scroll.top,
              left: ROW_HEADER_WIDTH + scroll.left,
              width: frozenW,
              height: frozenH,
            }}
          >
            {paneCells(frozenRowList, frozenColList, 0)}
          </div>
        )}
        <div className="kc-selection" style={selBox} />
        {fillPreview && (
          <div className="kc-fill-preview" style={box(fillPreview)} />
        )}
        <div className="kc-active" style={box(activeRange)} />
        {!readOnly && editing === null && (
          <div
            className="kc-fill-handle"
            title="Drag to fill"
            style={{
              top: (selBox.top as number) + (selBox.height as number) - 4,
              left: (selBox.left as number) + (selBox.width as number) - 4,
            }}
            onMouseDown={onFillMouseDown}
          />
        )}
        {presence.map((p) =>
          p.row < rows && p.col < cols ? (
            <div
              key={p.clientId}
              className="kc-presence"
              style={{
                ...box({
                  top: p.row,
                  bottom: p.row,
                  left: p.col,
                  right: p.col,
                }),
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
              ...box(activeRange),
              zIndex: 9,
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
              anchor: { row: rows - 1, col: cols - 1 },
              focus: { row: 0, col: 0 },
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
  .kc-pane {
    position: absolute;
    overflow: hidden;
    background-color: var(--c--contextuals--background--surface--primary, #fff);
    background-image: linear-gradient(to bottom, transparent ${ROW_HEIGHT - 1}px, #e3e5ea ${ROW_HEIGHT - 1}px);
    background-size: 100% ${ROW_HEIGHT}px;
    pointer-events: none;
  }
  .kc-pane-rows { z-index: 4; border-bottom: 2px solid #9aa3b5; }
  .kc-pane-cols { z-index: 4; border-right: 2px solid #9aa3b5; }
  .kc-pane-corner {
    z-index: 5;
    border-bottom: 2px solid #9aa3b5;
    border-right: 2px solid #9aa3b5;
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
    z-index: 10;
    cursor: default;
  }
  .kc-headers > .kc-header-frozen { z-index: 11; }
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
    z-index: 12;
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
  .kc-fill-preview {
    position: absolute;
    box-sizing: border-box;
    border: 1px dashed #1f4fa3;
    pointer-events: none;
    z-index: 8;
  }
  .kc-active {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid #1f4fa3;
    pointer-events: none;
    z-index: 3;
  }
  .kc-fill-handle {
    position: absolute;
    width: 7px;
    height: 7px;
    box-sizing: border-box;
    background: #1f4fa3;
    border: 1px solid #fff;
    cursor: crosshair;
    z-index: 8;
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
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }
`;
