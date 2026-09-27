/**
 * Draws slides: the same picture in the editor, the slide list, while
 * presenting and when printing. A slide is drawn at its own size (960 ×
 * 540) and scaled with a CSS transform.
 */
import type { CSSProperties, ReactNode } from 'react';

import type { Theme } from '../model/themes';
import {
  PlacedElement,
  SLIDE_H,
  SLIDE_W,
  ShapeKind,
  SlideElement,
  SlideMeta,
  effectiveStyle,
} from '../model/types';

/** The outline of a shape in a w × h box, as an SVG path. */
export const shapePath = (kind: ShapeKind, w: number, h: number): string => {
  switch (kind) {
    case 'roundRect': {
      const r = Math.min(w, h) * 0.18;
      return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
    }
    case 'ellipse':
      return `M0,${h / 2} A${w / 2},${h / 2} 0 1 1 ${w},${h / 2} A${w / 2},${h / 2} 0 1 1 0,${h / 2} Z`;
    case 'triangle':
      return `M${w / 2},0 L${w},${h} L0,${h} Z`;
    case 'diamond':
      return `M${w / 2},0 L${w},${h / 2} L${w / 2},${h} L0,${h / 2} Z`;
    case 'arrowRight': {
      const head = Math.min(w * 0.4, h);
      return `M0,${h * 0.25} H${w - head} V0 L${w},${h / 2} L${w - head},${h} V${h * 0.75} H0 Z`;
    }
    case 'star': {
      const points: string[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.4 : 1;
        points.push(
          `${w / 2 + (Math.cos(angle) * r * w) / 2},${h / 2 + (Math.sin(angle) * r * h) / 2}`,
        );
      }
      return `M${points.join(' L')} Z`;
    }
    case 'rect':
    default:
      return `M0,0 H${w} V${h} H0 Z`;
  }
};

export const isLine = (el: SlideElement) =>
  el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow');

const textColor = (el: SlideElement, theme: Theme) =>
  effectiveStyle(el).color ??
  (el.role === 'title' ? theme.titleColor : theme.textColor);

/** The text of a box: its lines, bullets or numbers, in its style. */
export const SlideText = ({
  el,
  theme,
}: {
  el: SlideElement;
  theme: Theme;
}) => {
  const style = effectiveStyle(el);
  const lines = (el.text ?? '').split('\n');
  const listed = style.bullets || style.numbered;
  const css: CSSProperties = {
    position: 'absolute',
    inset: 0,
    padding: '6px 10px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent:
      style.valign === 'middle'
        ? 'center'
        : style.valign === 'bottom'
          ? 'flex-end'
          : 'flex-start',
    color: textColor(el, theme),
    fontFamily:
      style.font ?? (el.role === 'title' ? theme.titleFont : theme.font),
    fontSize: style.size ?? 24,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    textAlign: style.align ?? 'left',
    lineHeight: 1.2,
    overflow: 'hidden',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  };
  return (
    <div style={css} className="ks-text">
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: '0.45em',
            justifyContent:
              style.align === 'center'
                ? 'center'
                : style.align === 'right'
                  ? 'flex-end'
                  : 'flex-start',
            marginBottom: listed ? '0.3em' : 0,
            minHeight: '1.2em',
          }}
        >
          {listed && line.trim() && (
            <span style={{ color: theme.accent, flex: '0 0 auto' }}>
              {style.numbered ? `${i + 1}.` : '•'}
            </span>
          )}
          <span style={{ minWidth: 0 }}>{line}</span>
        </div>
      ))}
    </div>
  );
};

/** One box on a slide: a text box, a shape (maybe with text) or a picture. */
export const SlideElementView = ({
  el,
  theme,
  hideText,
  children,
}: {
  el: SlideElement;
  theme: Theme;
  /** Leave the text out (it is being edited over the box). */
  hideText?: boolean;
  children?: ReactNode;
}) => {
  const line = isLine(el);
  const box: CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: Math.max(1, el.w),
    height: Math.max(1, el.h),
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity ?? 1,
  };
  let drawing: ReactNode = null;
  if (el.type === 'image' && el.src) {
    drawing = (
      <img
        src={el.src}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    );
  } else if (el.type === 'shape' && el.shape) {
    const stroke =
      el.stroke === 'none'
        ? 'none'
        : (el.stroke ?? (line ? theme.textColor : 'none'));
    const sw = el.strokeWidth ?? (line ? 3 : 2);
    if (line) {
      const horizontal = el.h < 16;
      const [x1, y1, x2, y2] = horizontal
        ? [0, el.h / 2, el.w, el.h / 2]
        : [0, 0, el.w, el.h];
      const markerId = `ks-arrow-${Math.round(el.x)}-${Math.round(el.y)}-${Math.round(el.w)}`;
      drawing = (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${Math.max(1, el.w)} ${Math.max(1, el.h)}`}
          preserveAspectRatio="none"
          style={{ overflow: 'visible', display: 'block' }}
        >
          {el.shape === 'arrow' && (
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 Z" fill={stroke} />
              </marker>
            </defs>
          )}
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={stroke === 'none' ? theme.textColor : stroke}
            strokeWidth={sw}
            markerEnd={el.shape === 'arrow' ? `url(#${markerId})` : undefined}
          />
        </svg>
      );
    } else {
      drawing = (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${Math.max(1, el.w)} ${Math.max(1, el.h)}`}
          preserveAspectRatio="none"
          style={{ overflow: 'visible', display: 'block' }}
        >
          <path
            d={shapePath(el.shape, el.w, el.h)}
            fill={el.fill ?? theme.accent}
            stroke={stroke}
            strokeWidth={stroke === 'none' ? 0 : sw}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
    }
  } else if (el.type === 'text' && el.fill) {
    drawing = (
      <div style={{ position: 'absolute', inset: 0, background: el.fill }} />
    );
  }
  return (
    <div style={box} className="ks-element">
      {drawing}
      {!line && !hideText && el.type !== 'image' && el.text !== undefined && (
        <SlideText el={el} theme={theme} />
      )}
      {children}
    </div>
  );
};

/** A whole slide, drawn *scale* times its size. */
export const SlideView = ({
  meta,
  elements,
  theme,
  scale,
}: {
  meta: SlideMeta;
  elements: PlacedElement[];
  theme: Theme;
  scale: number;
}) => (
  <div
    className="ks-slide-frame"
    style={{
      width: SLIDE_W * scale,
      height: SLIDE_H * scale,
      overflow: 'hidden',
      position: 'relative',
    }}
  >
    <div
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `scale(${scale})`,
        transformOrigin: '0 0',
        background: meta.background ?? theme.background,
      }}
    >
      {elements.map(({ id, el }) => (
        <SlideElementView key={id} el={el} theme={theme} />
      ))}
    </div>
  </div>
);
