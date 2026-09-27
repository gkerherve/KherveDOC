/**
 * The slide being edited: click to select a box, drag to move it, the
 * handles to resize or turn it, double-click to write in it. Moves show
 * as the pointer goes and are shared when the button is released.
 */
import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { SlideDeck } from '../model/deck';
import type { Theme } from '../model/themes';
import {
  PlacedElement,
  SLIDE_H,
  SLIDE_W,
  SlideElement,
  SlideMeta,
  effectiveStyle,
} from '../model/types';

import { SlideElementView, isLine } from './SlideView';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

type Gesture =
  | {
      kind: 'move';
      startX: number;
      startY: number;
      origin: Record<string, Box>;
      moved: boolean;
    }
  | {
      kind: 'resize';
      id: string;
      handle: Handle;
      startX: number;
      startY: number;
      origin: Box;
      keepRatio: boolean;
    }
  | { kind: 'rotate'; id: string; cx: number; cy: number };

const SNAP = 6;

interface SlideCanvasProps {
  deck: SlideDeck;
  meta: SlideMeta;
  elements: PlacedElement[];
  theme: Theme;
  scale: number;
  readOnly: boolean;
  selected: string[];
  onSelect: (ids: string[]) => void;
  editingId: string | null;
  onEdit: (id: string | null) => void;
}

export const SlideCanvas = ({
  deck,
  meta,
  elements,
  theme,
  scale,
  readOnly,
  selected,
  onSelect,
  editingId,
  onEdit,
}: SlideCanvasProps) => {
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  // Boxes as they are being moved or resized (not shared yet).
  const [preview, setPreview] = useState<Record<string, Box>>({});
  const [guides, setGuides] = useState<{ v?: number; h?: number }>({});

  const point = (e: { clientX: number; clientY: number }) => {
    const rect = surface.current?.getBoundingClientRect();
    return {
      x: (e.clientX - (rect?.left ?? 0)) / scale,
      y: (e.clientY - (rect?.top ?? 0)) / scale,
    };
  };

  const boxOf = (id: string, el: SlideElement): Box =>
    preview[id] ?? {
      x: el.x,
      y: el.y,
      w: el.w,
      h: el.h,
      rotation: el.rotation,
    };

  const byId = (id: string) => elements.find((e) => e.id === id)?.el;

  const startMove = (e: ReactPointerEvent, id: string) => {
    if (readOnly || e.button !== 0) {
      return;
    }
    e.stopPropagation();
    let ids = selected;
    if (e.shiftKey || e.metaKey) {
      ids = selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id];
      onSelect(ids);
      return;
    }
    if (!selected.includes(id)) {
      ids = [id];
      onSelect(ids);
    }
    if (editingId === id) {
      return;
    }
    const p = point(e);
    const origin: Record<string, Box> = {};
    for (const sid of ids) {
      const el = byId(sid);
      if (el) {
        origin[sid] = {
          x: el.x,
          y: el.y,
          w: el.w,
          h: el.h,
          rotation: el.rotation,
        };
      }
    }
    gesture.current = {
      kind: 'move',
      startX: p.x,
      startY: p.y,
      origin,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const startResize = (e: ReactPointerEvent, id: string, handle: Handle) => {
    e.stopPropagation();
    const el = byId(id);
    if (!el) {
      return;
    }
    const p = point(e);
    gesture.current = {
      kind: 'resize',
      id,
      handle,
      startX: p.x,
      startY: p.y,
      origin: { x: el.x, y: el.y, w: el.w, h: el.h, rotation: el.rotation },
      keepRatio: el.type === 'image' && handle.length === 2,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const startRotate = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation();
    const el = byId(id);
    if (!el) {
      return;
    }
    gesture.current = {
      kind: 'rotate',
      id,
      cx: el.x + el.w / 2,
      cy: el.y + el.h / 2,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) {
      return;
    }
    const p = point(e);
    if (g.kind === 'move') {
      let dx = p.x - g.startX;
      let dy = p.y - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < 2) {
        return;
      }
      g.moved = true;
      // Snap the moved boxes' middle to the slide's middle.
      const boxes = Object.values(g.origin);
      const left = Math.min(...boxes.map((b) => b.x)) + dx;
      const right = Math.max(...boxes.map((b) => b.x + b.w)) + dx;
      const top = Math.min(...boxes.map((b) => b.y)) + dy;
      const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + dy;
      const next: { v?: number; h?: number } = {};
      if (!e.altKey) {
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        if (Math.abs(cx - SLIDE_W / 2) < SNAP) {
          dx += SLIDE_W / 2 - cx;
          next.v = SLIDE_W / 2;
        }
        if (Math.abs(cy - SLIDE_H / 2) < SNAP) {
          dy += SLIDE_H / 2 - cy;
          next.h = SLIDE_H / 2;
        }
      }
      setGuides(next);
      const moved: Record<string, Box> = {};
      for (const [id, b] of Object.entries(g.origin)) {
        moved[id] = { ...b, x: Math.round(b.x + dx), y: Math.round(b.y + dy) };
      }
      setPreview(moved);
    } else if (g.kind === 'resize') {
      const o = g.origin;
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;
      let { x, y, w, h } = o;
      if (g.handle.includes('e')) {
        w = o.w + dx;
      }
      if (g.handle.includes('w')) {
        w = o.w - dx;
        x = o.x + dx;
      }
      if (g.handle.includes('s')) {
        h = o.h + dy;
      }
      if (g.handle.includes('n')) {
        h = o.h - dy;
        y = o.y + dy;
      }
      if ((g.keepRatio || e.shiftKey) && g.handle.length === 2 && o.h > 0) {
        const ratio = o.w / o.h;
        if (Math.abs(w / ratio) > Math.abs(h)) {
          const nh = w / ratio;
          if (g.handle.includes('n')) {
            y = o.y + o.h - nh;
          }
          h = nh;
        } else {
          const nw = h * ratio;
          if (g.handle.includes('w')) {
            x = o.x + o.w - nw;
          }
          w = nw;
        }
      }
      const min = 8;
      if (w < min) {
        if (g.handle.includes('w')) {
          x -= min - w;
        }
        w = min;
      }
      const el = byId(g.id);
      const minH = el && isLine(el) ? 1 : min;
      if (h < minH) {
        if (g.handle.includes('n')) {
          y -= minH - h;
        }
        h = minH;
      }
      setPreview({
        [g.id]: {
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(w),
          h: Math.round(h),
          rotation: o.rotation,
        },
      });
    } else {
      let angle = (Math.atan2(p.y - g.cy, p.x - g.cx) * 180) / Math.PI + 90;
      angle = ((angle % 360) + 360) % 360;
      if (e.shiftKey || Math.abs(angle - Math.round(angle / 90) * 90) < 4) {
        angle =
          Math.round(angle / (e.shiftKey ? 15 : 90)) * (e.shiftKey ? 15 : 90);
      }
      const el = byId(g.id);
      if (el) {
        setPreview({
          [g.id]: {
            x: el.x,
            y: el.y,
            w: el.w,
            h: el.h,
            rotation: Math.round(angle) % 360,
          },
        });
      }
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    setGuides({});
    if (!g) {
      return;
    }
    const changes = Object.entries(preview);
    setPreview({});
    if (changes.length) {
      deck.stopCapturing();
      deck.updateElements(
        changes.map(([id, b]) => [
          id,
          { x: b.x, y: b.y, w: b.w, h: b.h, rotation: b.rotation || undefined },
        ]),
      );
    }
  };

  // The text being written in a box.
  const editing = editingId
    ? elements.find((e) => e.id === editingId)
    : undefined;
  const textArea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing && textArea.current) {
      const area = textArea.current;
      area.focus();
      if (area.dataset.fresh === '1') {
        area.select();
        area.dataset.fresh = '';
      }
    }
    // Focus once when the box starts being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const editorStyle = (el: SlideElement): CSSProperties => {
    const style = effectiveStyle(el);
    return {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      padding: '6px 10px',
      border: 'none',
      outline: 'none',
      resize: 'none',
      background: 'rgba(255,255,255,0.08)',
      color:
        style.color ??
        (el.role === 'title' ? theme.titleColor : theme.textColor),
      fontFamily:
        style.font ?? (el.role === 'title' ? theme.titleFont : theme.font),
      fontSize: style.size ?? 24,
      fontWeight: style.bold ? 700 : 400,
      fontStyle: style.italic ? 'italic' : 'normal',
      textDecoration: style.underline ? 'underline' : 'none',
      textAlign: style.align,
      lineHeight: 1.2,
      overflow: 'hidden',
    };
  };

  const single = selected.length === 1 ? selected[0] : null;

  return (
    <div
      ref={surface}
      className="ks-surface"
      style={{
        width: SLIDE_W * scale,
        height: SLIDE_H * scale,
        position: 'relative',
      }}
      onPointerDown={(e) => {
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).dataset.bg
        ) {
          onSelect([]);
          onEdit(null);
        }
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        data-bg="1"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          background: meta.background ?? theme.background,
          overflow: 'hidden',
        }}
      >
        {elements.map(({ id, el }) => {
          const box = boxOf(id, el);
          const shown = { ...el, ...box };
          const isEditing = id === editingId;
          return (
            <div
              key={id}
              onPointerDown={(e) => startMove(e, id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!readOnly && el.type !== 'image' && !isLine(el)) {
                  onSelect([id]);
                  onEdit(id);
                }
              }}
              style={{
                cursor: readOnly ? 'default' : isEditing ? 'text' : 'move',
              }}
            >
              <SlideElementView el={shown} theme={theme} hideText={isEditing}>
                {isEditing && (
                  <textarea
                    ref={textArea}
                    data-fresh={
                      el.text === 'Text' ||
                      el.text?.startsWith('Click to add') ||
                      el.text === ''
                        ? '1'
                        : ''
                    }
                    aria-label="Text"
                    className="ks-text-editor"
                    style={editorStyle(el)}
                    value={el.text ?? ''}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      deck.updateElement(id, { text: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        onEdit(null);
                      }
                      e.stopPropagation();
                    }}
                    onBlur={() => onEdit(null)}
                  />
                )}
              </SlideElementView>
            </div>
          );
        })}
        {guides.v !== undefined && (
          <div
            className="ks-guide"
            style={{ left: guides.v, top: 0, width: 1, height: SLIDE_H }}
          />
        )}
        {guides.h !== undefined && (
          <div
            className="ks-guide"
            style={{ top: guides.h, left: 0, height: 1, width: SLIDE_W }}
          />
        )}
      </div>
      {/* Selection outlines and handles, drawn at screen size. */}
      {selected.map((id) => {
        const el = byId(id);
        if (!el) {
          return null;
        }
        const box = boxOf(id, el);
        const line = isLine(el);
        return (
          <div
            key={id}
            className="ks-selection"
            style={{
              left: box.x * scale,
              top: box.y * scale,
              width: Math.max(1, box.w) * scale,
              height: Math.max(1, box.h) * scale,
              transform: box.rotation
                ? `rotate(${box.rotation}deg)`
                : undefined,
            }}
          >
            {!readOnly && id === single && editingId !== id && (
              <>
                {(line ? (['w', 'e'] as Handle[]) : HANDLES).map((handle) => (
                  <div
                    key={handle}
                    className={`ks-handle ks-handle-${handle}`}
                    onPointerDown={(e) => startResize(e, id, handle)}
                  />
                ))}
                {!line && (
                  <div
                    className="ks-rotate"
                    title="Turn"
                    onPointerDown={(e) => startRotate(e, id)}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};
