/**
 * Charts floating over the grid. Each is drawn by matplotlib in the engine
 * (like KherveSheet's charts) and redrawn when its data changes; it can be
 * moved, resized, opened for editing (double-click) or deleted.
 */
import {
  MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { ChartSpec, ROW_HEIGHT } from '../model/layout';
import type { SheetWorkbook } from '../model/workbook';

import { GridGeometry, HEADER_HEIGHT, ROW_HEADER_WIDTH } from './SheetGrid';

const MIN_WIDTH = 160;
const MIN_HEIGHT = 120;

interface ChartLayerProps {
  workbook: SheetWorkbook;
  sheetId: string;
  geometry: GridGeometry;
  rows: number;
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
}

export const ChartLayer = ({
  workbook,
  sheetId,
  geometry,
  rows,
  selectedId,
  readOnly,
  onSelect,
  onEdit,
}: ChartLayerProps) => (
  <>
    {workbook.charts(sheetId).map(({ id, spec }) => (
      <ChartBox
        key={id}
        id={id}
        spec={spec}
        workbook={workbook}
        geometry={geometry}
        rows={rows}
        selected={selectedId === id}
        readOnly={readOnly}
        onSelect={onSelect}
        onEdit={onEdit}
      />
    ))}
  </>
);

/** The cell (and pixels inside it) at x, y of the cell area. */
const anchorAt = (
  geometry: GridGeometry,
  rows: number,
  x: number,
  y: number,
) => {
  const { lefts, widths } = geometry;
  let col = 0;
  while (col < lefts.length - 1 && lefts[col] + widths[col] <= x) {
    col += 1;
  }
  const row = Math.max(0, Math.min(rows - 1, Math.floor(y / ROW_HEIGHT)));
  return {
    row,
    col,
    dx: Math.round(Math.max(0, x - lefts[col])),
    dy: Math.round(Math.max(0, y - row * ROW_HEIGHT)),
  };
};

/** What the picture depends on (not where the chart sits). */
const drawingKey = (spec: ChartSpec) => {
  const { row: _r, col: _c, dx: _x, dy: _y, ...rest } = spec;
  return JSON.stringify(rest);
};

type Gesture =
  | { kind: 'move'; x: number; y: number; left: number; top: number }
  | { kind: 'resize'; x: number; y: number; width: number; height: number };

const ChartBox = ({
  id,
  spec,
  workbook,
  geometry,
  rows,
  selected,
  readOnly,
  onSelect,
  onEdit,
}: {
  id: string;
  spec: ChartSpec;
  workbook: SheetWorkbook;
  geometry: GridGeometry;
  rows: number;
  selected: boolean;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const [image, setImage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(true);
  const [live, setLive] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const imageUrl = useRef<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(
    () => () => {
      if (imageUrl.current) {
        URL.revokeObjectURL(imageUrl.current);
      }
    },
    [],
  );

  const left = (geometry.lefts[spec.col] ?? 0) + (spec.dx ?? 0);
  const top = spec.row * ROW_HEIGHT + (spec.dy ?? 0);
  const box = live ?? { left, top, width: spec.width, height: spec.height };

  // Draw when the chart or any value changes (a burst of edits: once).
  const key = drawingKey(spec);
  const dataVersion = workbook.dataVersion;
  useEffect(() => {
    let cancelled = false;
    setDrawing(true);
    const timer = window.setTimeout(() => {
      workbook
        .renderChart(JSON.parse(key) as ChartSpec)
        .then((result) => {
          if (cancelled) {
            return;
          }
          if (result.svg) {
            // As an image: the SVG cannot run anything or restyle the page.
            const url = URL.createObjectURL(
              new Blob([result.svg], { type: 'image/svg+xml' }),
            );
            if (imageUrl.current) {
              URL.revokeObjectURL(imageUrl.current);
            }
            imageUrl.current = url;
            setImage(url);
            setProblem(null);
          } else {
            setProblem(result.error ?? t('The chart could not be drawn.'));
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setProblem(String(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setDrawing(false);
          }
        });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [workbook, key, dataVersion, t]);

  const startGesture = (event: ReactMouseEvent, kind: Gesture['kind']) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    boxRef.current?.focus({ preventScroll: true }); // for Delete, Enter…
    onSelect(id);
    if (readOnly) {
      return;
    }
    gesture.current =
      kind === 'move'
        ? { kind, x: event.clientX, y: event.clientY, left, top }
        : {
            kind,
            x: event.clientX,
            y: event.clientY,
            width: spec.width,
            height: spec.height,
          };
    let last = { left, top, width: spec.width, height: spec.height };
    let moved = false;
    const onMove = (e: MouseEvent) => {
      const g = gesture.current;
      if (!g) {
        return;
      }
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      moved ||= Math.abs(dx) + Math.abs(dy) > 2;
      last =
        g.kind === 'move'
          ? {
              ...last,
              left: Math.max(0, g.left + dx),
              top: Math.max(0, g.top + dy),
            }
          : {
              ...last,
              width: Math.max(MIN_WIDTH, g.width + dx),
              height: Math.max(MIN_HEIGHT, g.height + dy),
            };
      setLive({ ...last });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const g = gesture.current;
      gesture.current = null;
      if (g && moved) {
        if (g.kind === 'move') {
          workbook.updateChart(
            id,
            anchorAt(geometry, rows, last.left, last.top),
          );
        } else {
          workbook.updateChart(id, {
            width: Math.round(last.width),
            height: Math.round(last.height),
          });
        }
      }
      setLive(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={boxRef}
      className={`kc-chart${selected ? ' kc-chart-selected' : ''}`}
      style={{
        left: ROW_HEADER_WIDTH + box.left,
        top: HEADER_HEIGHT + box.top,
        width: box.width,
        height: box.height,
      }}
      role="img"
      aria-label={spec.title || t('Chart')}
      tabIndex={0}
      onMouseDown={(e) => startGesture(e, 'move')}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!readOnly) {
          onEdit(id);
        }
      }}
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (!readOnly && (e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault();
          workbook.removeChart(id);
          onSelect(null);
        } else if (!readOnly && e.key === 'Enter') {
          onEdit(id);
        } else if (e.key === 'Escape') {
          onSelect(null);
        }
      }}
    >
      {image && !problem && (
        <img
          src={image}
          alt=""
          draggable={false}
          style={{ opacity: live?.width ? 0.6 : 1 }}
        />
      )}
      {(problem || (!image && drawing)) && (
        <div className="kc-chart-message">
          {problem ?? t('Drawing the chart…')}
        </div>
      )}
      {selected && !readOnly && (
        <>
          <button
            type="button"
            className="kc-chart-edit"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onEdit(id)}
          >
            {t('Edit chart')}
          </button>
          <div
            className="kc-chart-resize"
            title={t('Drag to resize')}
            onMouseDown={(e) => startGesture(e, 'resize')}
          />
        </>
      )}
    </div>
  );
};

export const chartCss = `
  .kc-chart {
    position: absolute;
    z-index: 6;
    box-sizing: border-box;
    background: #fff;
    border: 1px solid #d6d9e0;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    cursor: move;
    outline: none;
    user-select: none;
  }
  .kc-chart-selected {
    border: 2px solid #1a73e8;
  }
  .kc-chart img {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .kc-chart-message {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    text-align: center;
    font-size: 13px;
    color: #6b7080;
  }
  .kc-chart-resize {
    position: absolute;
    right: -5px;
    bottom: -5px;
    width: 10px;
    height: 10px;
    background: #1a73e8;
    border: 1px solid #fff;
    cursor: nwse-resize;
  }
  .kc-chart-edit {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 2px 8px;
    font-size: 12px;
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    background: #fff;
    cursor: pointer;
  }
`;
