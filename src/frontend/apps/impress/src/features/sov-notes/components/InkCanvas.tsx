/**
 * The handwriting layer over a note's text. With the pen out it takes the
 * pointer (mouse, finger or stylus) and draws; otherwise it only shows the
 * drawing and lets clicks through to the text underneath.
 */
import { useEffect, useRef, useState } from 'react';

import {
  InkTool,
  NoteInk,
  PAGE_WIDTH,
  Stroke,
  hitsStroke,
  strokePath,
} from '../model/ink';

export type PenTool = InkTool | 'eraser';

interface InkCanvasProps {
  ink: NoteInk;
  /** Re-render when the drawing changes (from useNoteInk). */
  version: number;
  drawing: boolean;
  tool: PenTool;
  color: string;
  width: number;
}

const ERASER_RADIUS = 8;
const HIGHLIGHTER_OPACITY = 0.35;

const StrokeView = ({ stroke }: { stroke: Omit<Stroke, 'id' | 'at'> }) => (
  <path
    d={strokePath(stroke.points)}
    fill="none"
    stroke={stroke.color}
    strokeWidth={stroke.width}
    strokeOpacity={stroke.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

export const InkCanvas = ({
  ink,
  version,
  drawing,
  tool,
  color,
  width,
}: InkCanvasProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [current, setCurrent] = useState<number[] | null>(null);
  const pointsRef = useRef<number[] | null>(null);
  const penSeen = useRef(false);
  // The layer covers the whole page (text and room below it to draw), so
  // its height in page units follows the page's size on screen.
  const [box, setBox] = useState({ width: PAGE_WIDTH, height: 1100 });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0) {
        setBox({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const toPage = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = rect.width / PAGE_WIDTH;
    return [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale];
  };

  // Erases along the eraser's path, so a quick swipe misses nothing.
  const erase = (x: number, y: number) => {
    const points = pointsRef.current ?? [];
    const [fx, fy] = points.length ? points : [x, y];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - fx, y - fy) / 4));
    const hit = ink.strokes().filter((stroke) => {
      for (let i = 0; i <= steps; i++) {
        const px = fx + ((x - fx) * i) / steps;
        const py = fy + ((y - fy) * i) / steps;
        if (hitsStroke(stroke, px, py, ERASER_RADIUS)) {
          return true;
        }
      }
      return false;
    });
    ink.remove(hit.map((stroke) => stroke.id));
    pointsRef.current = [x, y];
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'pen') {
      penSeen.current = true;
    } else if (e.pointerType === 'touch' && penSeen.current) {
      // A hand resting on the screen while writing with a stylus.
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') {
      return;
    }
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not a live pointer (a synthetic event): draw without capture.
    }
    const [x, y] = toPage(e);
    if (tool === 'eraser') {
      pointsRef.current = null;
      erase(x, y);
      return;
    }
    pointsRef.current = [x, y];
    setCurrent([x, y]);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const points = pointsRef.current;
    if (!points) {
      return;
    }
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = rect.width / PAGE_WIDTH;
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const x = (ev.clientX - rect.left) / scale;
      const y = (ev.clientY - rect.top) / scale;
      if (tool === 'eraser') {
        erase(x, y);
        continue;
      }
      const lx = points[points.length - 2];
      const ly = points[points.length - 1];
      if (Math.hypot(x - lx, y - ly) >= 1.5) {
        points.push(x, y);
      }
    }
    if (tool !== 'eraser') {
      setCurrent([...points]);
    }
  };

  const finish = () => {
    const points = pointsRef.current;
    pointsRef.current = null;
    setCurrent(null);
    if (points && points.length && tool !== 'eraser') {
      ink.add({ tool, color, width, points });
    }
  };

  const strokes = ink.strokes();
  const height = (box.height * PAGE_WIDTH) / box.width;

  return (
    <svg
      ref={svgRef}
      data-version={version}
      className="sov-note-ink"
      viewBox={`0 0 ${PAGE_WIDTH} ${height}`}
      preserveAspectRatio="xMinYMin meet"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: drawing ? 'auto' : 'none',
        touchAction: drawing ? 'none' : 'auto',
        cursor: drawing ? (tool === 'eraser' ? 'cell' : 'crosshair') : 'auto',
        zIndex: 2,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      aria-hidden
    >
      {strokes.map((stroke) => (
        <StrokeView key={stroke.id} stroke={stroke} />
      ))}
      {current && (
        <StrokeView
          stroke={{ tool: tool as InkTool, color, width, points: current }}
        />
      )}
    </svg>
  );
};

/** How tall the page must be for the drawing plus room to keep drawing,
 * for a page this wide on screen (px). */
export const inkHeight = (ink: NoteInk, pageWidth: number) =>
  (Math.max(ink.bottom() + 400, 1100) * pageWidth) / PAGE_WIDTH;
