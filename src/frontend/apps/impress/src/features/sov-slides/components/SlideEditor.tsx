/**
 * SOV Slides: a PowerPoint-style presentation editor. The slide list
 * on the left, the slide being edited in the middle with its speaker notes
 * below, the toolbar in the window's toolbar slot.
 */
import { VariantType, useToastProvider } from '@gouvfr-lasuite/ui-components';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DropdownMenuOption } from '@/components';
import type { Menu } from '@/docs/doc-editor/components/SovToolbar/MenuBar';
import { useNativeMenus } from '@/docs/doc-editor/components/SovToolbar/nativeMenus';
import { useStyleElement } from '@/docs/doc-editor/page-setup/useStyleElement';
import { takePendingImport } from '@/docs/doc-import/pendingImport';

import { useSlideDeck, useSlidePresence } from '../hooks';
import type { SlideDeck } from '../model/deck';
import { LAYOUTS, LayoutId, NewElement } from '../model/layouts';
import { readPptx, writePptx } from '../model/pptx';
import { THEMES } from '../model/themes';
import {
  SHAPES,
  SLIDE_H,
  SLIDE_W,
  ShapeKind,
  SlideElement,
  TextStyle,
} from '../model/types';

import { SlideCanvas } from './SlideCanvas';
import { Presenter, SlidePrint } from './SlideShow';
import { SlideToolbar } from './SlideToolbar';
import { SlideView } from './SlideView';

interface SlideEditorProps {
  docId: string;
  provider: HocuspocusProvider;
  synced: boolean;
  readOnly: boolean;
  userName: string;
  userColor: string;
  /** The document's title (the name of a downloaded .pptx). */
  title?: string;
}

const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  roundRect: 'Rounded rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  diamond: 'Diamond',
  arrowRight: 'Block arrow',
  star: 'Star',
  line: 'Line',
  arrow: 'Arrow',
};

const safeName = (title: string) => title.replace(/[\\/:*?"<>|]/g, '-');

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** A picture made small enough to keep in the document (max 1600 px). */
export const pictureDataUrl = (file: File) =>
  new Promise<{ src: string; w: number; h: number }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Cannot read the picture'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not a picture'));
      img.onload = () => {
        const max = 1600;
        const ratio = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        if (ratio === 1 && file.size < 400 * 1024) {
          resolve({ src: reader.result as string, w, h });
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        const keepAlpha = /png|gif|webp|svg/.test(file.type);
        resolve({
          src: canvas.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.86),
          w,
          h,
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

export const SlideEditor = (props: SlideEditorProps) => {
  const { deck, version } = useSlideDeck(
    props.provider,
    !props.readOnly,
    props.synced,
  );
  useStyleElement(slidesCss);
  if (!deck) {
    return null;
  }
  return <SlideDeckView {...props} deck={deck} version={version} />;
};

const SlideDeckView = ({
  docId,
  provider,
  synced,
  readOnly,
  userName,
  userColor,
  title,
  deck,
  version,
}: SlideEditorProps & { deck: SlideDeck; version: number }) => {
  const { t } = useTranslation();
  const { toast } = useToastProvider();
  const slides = useMemo(
    () => deck.slides(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck, version],
  );
  const theme = useMemo(
    () => deck.theme(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck, version],
  );
  const [slideId, setSlideId] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  const clipboard = useRef<SlideElement[]>([]);
  const pptxInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const canvasWrap = useRef<HTMLDivElement | null>(null);
  // The area around the slide (it appears once the slides are loaded).
  const [wrapElement, setWrapElement] = useState<HTMLDivElement | null>(null);
  const wrapRef = useCallback((element: HTMLDivElement | null) => {
    canvasWrap.current = element;
    setWrapElement(element);
  }, []);
  const [wrapSize, setWrapSize] = useState({ w: 800, h: 450 });
  const nativeMenus = useRef<Menu[]>([]);
  useNativeMenus(nativeMenus);

  // The slide shown: the chosen one while it exists, else the first.
  const activeId =
    slideId && slides.some((s) => s.id === slideId) ? slideId : slides[0]?.id;
  const activeIndex = slides.findIndex((s) => s.id === activeId);
  const active = slides[activeIndex];
  const elements = useMemo(
    () => (activeId ? deck.elements(activeId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck, activeId, version],
  );
  const selection = selected.filter((id) => elements.some((e) => e.id === id));
  const first = elements.find((e) => e.id === selection[0])?.el;

  const presence = useMemo(
    () =>
      activeId
        ? { slide: activeId, name: userName, color: userColor }
        : undefined,
    [activeId, userName, userColor],
  );
  const others = useSlidePresence(provider, presence);

  useEffect(() => {
    if (!wrapElement) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setWrapSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(wrapElement);
    return () => observer.disconnect();
  }, [wrapElement]);
  const scale = Math.max(
    0.2,
    Math.min((wrapSize.w - 48) / SLIDE_W, (wrapSize.h - 48) / SLIDE_H),
  );

  // ── Changes ──────────────────────────────────────────────────────
  const goTo = (id: string | undefined) => {
    setSlideId(id);
    setSelected([]);
    setEditingId(null);
  };

  const addSlide = (layout: LayoutId) => {
    goTo(deck.addSlide(layout, activeId));
  };

  const addElement = (el: NewElement, edit = false) => {
    if (!activeId) {
      return;
    }
    const id = deck.addElement(activeId, el);
    setSelected([id]);
    setEditingId(edit ? id : null);
  };

  const addTextBox = () =>
    addElement(
      {
        type: 'text',
        role: 'body',
        x: SLIDE_W / 2 - 200,
        y: SLIDE_H / 2 - 40,
        w: 400,
        h: 80,
        text: 'Text',
        style: { size: 28 },
      },
      true,
    );

  const addShape = (shape: ShapeKind) => {
    const line = shape === 'line' || shape === 'arrow';
    addElement({
      type: 'shape',
      shape,
      x: SLIDE_W / 2 - (line ? 150 : 110),
      y: SLIDE_H / 2 - (line ? 2 : 80),
      w: line ? 300 : 220,
      h: line ? 4 : 160,
      text: line ? undefined : '',
      style: line
        ? undefined
        : { size: 24, align: 'center', valign: 'middle', color: '#ffffff' },
    });
  };

  const addPicture = async (file: File) => {
    try {
      const { src, w, h } = await pictureDataUrl(file);
      const fit = Math.min(1, 640 / w, 400 / h);
      addElement({
        type: 'image',
        src,
        x: Math.round(SLIDE_W / 2 - (w * fit) / 2),
        y: Math.round(SLIDE_H / 2 - (h * fit) / 2),
        w: Math.round(w * fit),
        h: Math.round(h * fit),
      });
    } catch {
      toast(t('This picture cannot be added.'), VariantType.ERROR);
    }
  };

  const setStyle = (patch: Partial<TextStyle>) => {
    deck.updateElements(
      selection.map((id) => {
        const el = deck.element(id);
        return [id, { style: { ...(el?.style ?? {}), ...patch } }];
      }),
    );
  };

  const setElement = (patch: Partial<SlideElement>) =>
    deck.updateElements(selection.map((id) => [id, patch]));

  const removeSelection = () => {
    deck.removeElements(selection);
    setSelected([]);
    setEditingId(null);
  };

  const copy = (cut = false) => {
    clipboard.current = selection
      .map((id) => deck.element(id))
      .filter((el): el is SlideElement => !!el);
    if (cut) {
      removeSelection();
    }
  };

  const paste = () => {
    if (!activeId || !clipboard.current.length) {
      return;
    }
    const ids = clipboard.current.map(({ slide: _slide, z: _z, ...el }) =>
      deck.addElement(activeId, { ...el, x: el.x + 20, y: el.y + 20 }),
    );
    clipboard.current = clipboard.current.map((el) => ({
      ...el,
      x: el.x + 20,
      y: el.y + 20,
    }));
    setSelected(ids);
  };

  const duplicateSelection = () => {
    copy();
    paste();
  };

  const moveSlide = (delta: number) => {
    if (activeId) {
      deck.moveSlide(activeId, activeIndex + delta);
    }
  };

  const removeSlide = () => {
    if (!activeId || slides.length <= 1) {
      return;
    }
    const next = slides[activeIndex + 1]?.id ?? slides[activeIndex - 1]?.id;
    deck.removeSlide(activeId);
    goTo(next);
  };

  // ── Files ────────────────────────────────────────────────────────
  const importPptx = useCallback(
    async (file: File) => {
      try {
        const imported = await readPptx(await file.arrayBuffer());
        if (!imported.length) {
          toast(t('No slides found in this file.'), VariantType.WARNING);
          return;
        }
        const firstId = deck.importSlides(imported);
        goTo(firstId);
        toast(
          t('{{count}} slides imported', { count: imported.length }),
          VariantType.SUCCESS,
        );
      } catch (error) {
        console.error(error);
        toast(t('This PowerPoint file cannot be read.'), VariantType.ERROR);
      }
    },
    [deck, t, toast],
  );

  // A file chosen with "Import a file…" before this document existed.
  useEffect(() => {
    if (!synced || readOnly) {
      return;
    }
    const file = takePendingImport(docId);
    if (file) {
      void importPptx(file);
    }
  }, [docId, synced, readOnly, importPptx]);

  const downloadPptx = async () => {
    try {
      const blob = await writePptx(deck, title || t('Untitled slides'));
      download(blob, `${safeName(title || 'slides')}.pptx`);
    } catch (error) {
      console.error(error);
      toast(t('The PowerPoint file could not be made.'), VariantType.ERROR);
    }
  };

  const closePresenter = useCallback(() => setPresenting(null), []);
  const endPrint = useCallback(() => setPrinting(false), []);

  // ── Keyboard ─────────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editingId) {
      return;
    }
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'F5') {
      e.preventDefault();
      setPresenting(e.shiftKey ? Math.max(0, activeIndex) : 0);
      return;
    }
    if (readOnly) {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        goTo(slides[activeIndex + 1]?.id ?? activeId);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        goTo(slides[activeIndex - 1]?.id ?? activeId);
      }
      return;
    }
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        deck.redo();
      } else {
        deck.undo();
      }
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      deck.redo();
    } else if (mod && e.key.toLowerCase() === 'c') {
      copy();
    } else if (mod && e.key.toLowerCase() === 'x') {
      copy(true);
    } else if (mod && e.key.toLowerCase() === 'v') {
      if (clipboard.current.length) {
        e.preventDefault();
        paste();
      }
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelection();
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(elements.map((el) => el.id));
    } else if (mod && e.key.toLowerCase() === 'b' && selection.length) {
      e.preventDefault();
      setStyle({ bold: !first?.style?.bold });
    } else if (mod && e.key.toLowerCase() === 'i' && selection.length) {
      e.preventDefault();
      setStyle({ italic: !first?.style?.italic });
    } else if (mod && e.key.toLowerCase() === 'u' && selection.length) {
      e.preventDefault();
      setStyle({ underline: !first?.style?.underline });
    } else if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      selection.length
    ) {
      e.preventDefault();
      removeSelection();
    } else if (
      e.key === 'Enter' &&
      selection.length === 1 &&
      first &&
      first.type !== 'image'
    ) {
      e.preventDefault();
      setEditingId(selection[0]);
    } else if (e.key === 'Escape') {
      setSelected([]);
    } else if (e.key.startsWith('Arrow') && selection.length) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx =
        e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      deck.updateElements(
        selection.map((id) => {
          const el = deck.element(id);
          return [id, { x: (el?.x ?? 0) + dx, y: (el?.y ?? 0) + dy }];
        }),
      );
    } else if (e.key === 'PageDown') {
      goTo(slides[activeIndex + 1]?.id ?? activeId);
    } else if (e.key === 'PageUp') {
      goTo(slides[activeIndex - 1]?.id ?? activeId);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (readOnly || editingId || clipboard.current.length) {
      return;
    }
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA'].includes(target.tagName)) {
      return;
    }
    const picture = Array.from(e.clipboardData.files).find((f) =>
      f.type.startsWith('image/'),
    );
    if (picture) {
      e.preventDefault();
      void addPicture(picture);
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    if (text.trim()) {
      e.preventDefault();
      addElement({
        type: 'text',
        role: 'body',
        x: 80,
        y: 160,
        w: SLIDE_W - 160,
        h: 220,
        text: text.trim(),
        style: { size: 24 },
      });
    }
  };

  // ── Menus ────────────────────────────────────────────────────────
  const option = (
    label: string,
    callback: () => void,
    extra: Partial<DropdownMenuOption> = {},
  ): DropdownMenuOption => ({ label, callback, ...extra });
  const newSlideOptions = LAYOUTS.map((layout) =>
    option(t(layout.label), () => addSlide(layout.id)),
  );
  const shapeOptions = SHAPES.map((shape) =>
    option(t(SHAPE_LABELS[shape]), () => addShape(shape)),
  );
  const themeOptions = THEMES.map((th) =>
    option(t(th.name), () => deck.setTheme(th.id), {
      isSelected: th.id === theme.id,
    }),
  );
  const none = !selection.length;
  const menus: Menu[] = [
    {
      key: 'file',
      label: t('File'),
      options: [
        option(
          t('Import PowerPoint (.pptx)…'),
          () => pptxInput.current?.click(),
          {
            disabled: readOnly,
          },
        ),
        option(t('Download as PowerPoint (.pptx)'), () => void downloadPptx(), {
          showSeparator: true,
        }),
        option(t('Print / Save as PDF…'), () => setPrinting(true)),
      ],
    },
    {
      key: 'edit',
      label: t('Edit'),
      options: [
        option(t('Undo'), () => deck.undo(), {
          disabled: readOnly || !deck.undoManager.canUndo(),
        }),
        option(t('Redo'), () => deck.redo(), {
          disabled: readOnly || !deck.undoManager.canRedo(),
          showSeparator: true,
        }),
        option(t('Duplicate'), duplicateSelection, {
          disabled: readOnly || none,
        }),
        option(t('Delete'), removeSelection, { disabled: readOnly || none }),
        option(
          t('Select all'),
          () => setSelected(elements.map((el) => el.id)),
          {
            disabled: readOnly,
          },
        ),
      ],
    },
    {
      key: 'insert',
      label: t('Insert'),
      options: [
        ...newSlideOptions.map((o, i) => ({
          ...o,
          label: `${t('New slide')}: ${o.label}`,
          disabled: readOnly,
          showSeparator: i === newSlideOptions.length - 1,
        })),
        option(t('Text box'), addTextBox, { disabled: readOnly }),
        option(t('Picture…'), () => imageInput.current?.click(), {
          disabled: readOnly,
          showSeparator: true,
        }),
        ...shapeOptions.map((o) => ({ ...o, disabled: readOnly })),
      ],
    },
    {
      key: 'format',
      label: t('Format'),
      options: [
        option(t('Bold'), () => setStyle({ bold: !first?.style?.bold }), {
          disabled: readOnly || none,
          isSelected: !!first?.style?.bold,
        }),
        option(t('Italic'), () => setStyle({ italic: !first?.style?.italic }), {
          disabled: readOnly || none,
          isSelected: !!first?.style?.italic,
        }),
        option(
          t('Underline'),
          () => setStyle({ underline: !first?.style?.underline }),
          {
            disabled: readOnly || none,
            isSelected: !!first?.style?.underline,
            showSeparator: true,
          },
        ),
        option(
          t('Bullets'),
          () => setStyle({ bullets: !first?.style?.bullets, numbered: false }),
          {
            disabled: readOnly || none,
            isSelected: !!first?.style?.bullets,
          },
        ),
        option(
          t('Numbered list'),
          () => setStyle({ numbered: !first?.style?.numbered, bullets: false }),
          {
            disabled: readOnly || none,
            isSelected: !!first?.style?.numbered,
            showSeparator: true,
          },
        ),
        option(
          t('Bring to front'),
          () => selection.forEach((id) => deck.restack(id, true)),
          {
            disabled: readOnly || none,
          },
        ),
        option(
          t('Send to back'),
          () => selection.forEach((id) => deck.restack(id, false)),
          {
            disabled: readOnly || none,
          },
        ),
      ],
    },
    {
      key: 'slide',
      label: t('Slide'),
      options: [
        option(t('Present from the beginning'), () => setPresenting(0)),
        option(
          t('Present from this slide'),
          () => setPresenting(Math.max(0, activeIndex)),
          {
            showSeparator: true,
          },
        ),
        option(
          t('Duplicate slide'),
          () => activeId && goTo(deck.duplicateSlide(activeId)),
          {
            disabled: readOnly,
          },
        ),
        option(t('Delete slide'), removeSlide, {
          disabled: readOnly || slides.length <= 1,
        }),
        option(t('Move slide up'), () => moveSlide(-1), {
          disabled: readOnly || activeIndex <= 0,
        }),
        option(t('Move slide down'), () => moveSlide(1), {
          disabled: readOnly || activeIndex >= slides.length - 1,
          showSeparator: true,
        }),
        option(t('Show speaker notes'), () => setNotesOpen((open) => !open), {
          isSelected: notesOpen,
        }),
      ],
    },
    {
      key: 'design',
      label: t('Design'),
      options: themeOptions.map((o) => ({ ...o, disabled: readOnly })),
    },
  ];
  nativeMenus.current = menus;

  // ── Slide list drag and drop ─────────────────────────────────────
  const dragged = useRef<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  if (!active) {
    return <div className="ks-loading">{t('Loading the slides…')}</div>;
  }

  return (
    <div className="ks-root" onKeyDown={onKeyDown} onPaste={onPaste}>
      <SlideToolbar
        menus={menus}
        readOnly={readOnly}
        canUndo={deck.undoManager.canUndo()}
        canRedo={deck.undoManager.canRedo()}
        onUndo={() => deck.undo()}
        onRedo={() => deck.redo()}
        newSlideOptions={newSlideOptions}
        shapeOptions={shapeOptions}
        themeOptions={themeOptions}
        onTextBox={addTextBox}
        onImage={() => imageInput.current?.click()}
        selected={first}
        hasSelection={!none}
        onStyle={setStyle}
        onElement={setElement}
        onRestack={(toFront) =>
          selection.forEach((id) => deck.restack(id, toFront))
        }
        onDelete={removeSelection}
        background={active.meta.background ?? theme.background}
        onBackground={(color) =>
          deck.setSlide(active.id, { background: color })
        }
        onPresent={() => setPresenting(Math.max(0, activeIndex))}
      />
      <div className="ks-body">
        <nav
          className="ks-list"
          aria-label={t('Slides')}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              e.stopPropagation();
              goTo(slides[activeIndex + 1]?.id ?? activeId);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              e.stopPropagation();
              goTo(slides[activeIndex - 1]?.id ?? activeId);
            } else if (
              (e.key === 'Delete' || e.key === 'Backspace') &&
              !readOnly
            ) {
              e.preventDefault();
              e.stopPropagation();
              removeSlide();
            }
          }}
        >
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={`ks-thumb-row${dropAt === index ? ' ks-drop-before' : ''}`}
              draggable={!readOnly}
              onDragStart={() => {
                dragged.current = slide.id;
              }}
              onDragOver={(e) => {
                if (dragged.current) {
                  e.preventDefault();
                  const rect = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  setDropAt(
                    e.clientY < rect.top + rect.height / 2 ? index : index + 1,
                  );
                }
              }}
              onDragEnd={() => {
                dragged.current = null;
                setDropAt(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragged.current;
                if (id && dropAt !== null) {
                  const from = slides.findIndex((s) => s.id === id);
                  deck.moveSlide(id, dropAt > from ? dropAt - 1 : dropAt);
                }
                dragged.current = null;
                setDropAt(null);
              }}
            >
              <span className="ks-thumb-number">{index + 1}</span>
              <button
                type="button"
                className={`ks-thumb${slide.id === activeId ? ' ks-thumb-active' : ''}`}
                aria-label={t('Slide {{number}}', { number: index + 1 })}
                aria-current={slide.id === activeId ? 'true' : undefined}
                onClick={() => goTo(slide.id)}
                onDoubleClick={() => setPresenting(index)}
              >
                <SlideView
                  meta={slide.meta}
                  elements={deck.elements(slide.id)}
                  theme={theme}
                  scale={0.17}
                />
                <span className="ks-thumb-people">
                  {others
                    .filter((o) => o.slide === slide.id)
                    .map((o) => (
                      <span
                        key={o.clientId}
                        className="ks-person"
                        title={o.name}
                        style={{ background: o.color }}
                      >
                        {o.name.slice(0, 1).toUpperCase()}
                      </span>
                    ))}
                </span>
                {slide.meta.notes && (
                  <span
                    className="material-icons ks-thumb-notes"
                    aria-hidden
                    title={t('Has speaker notes')}
                  >
                    sticky_note_2
                  </span>
                )}
              </button>
            </div>
          ))}
          {dropAt === slides.length && <div className="ks-drop-end" />}
          {!readOnly && (
            <button
              type="button"
              className="ks-add-slide"
              onClick={() => addSlide('content')}
            >
              <span className="material-icons" aria-hidden>
                add
              </span>
              {t('New slide')}
            </button>
          )}
        </nav>
        <div className="ks-main">
          <div
            ref={wrapRef}
            className="ks-canvas-wrap"
            tabIndex={0}
            aria-label={t('Slide {{number}}', { number: activeIndex + 1 })}
          >
            <div className="ks-canvas-shadow">
              <SlideCanvas
                deck={deck}
                meta={active.meta}
                elements={elements}
                theme={theme}
                scale={scale}
                readOnly={readOnly}
                selected={selection}
                onSelect={(ids) => {
                  setSelected(ids);
                  canvasWrap.current?.focus({ preventScroll: true });
                }}
                editingId={editingId}
                onEdit={(id) => {
                  if (!id) {
                    deck.stopCapturing();
                    canvasWrap.current?.focus({ preventScroll: true });
                  }
                  setEditingId(id);
                }}
              />
            </div>
          </div>
          {notesOpen && (
            <textarea
              className="ks-notes"
              aria-label={t('Speaker notes')}
              placeholder={t('Speaker notes: what to say with this slide')}
              readOnly={readOnly}
              value={active.meta.notes ?? ''}
              onChange={(e) =>
                deck.setSlide(active.id, { notes: e.target.value })
              }
            />
          )}
        </div>
      </div>
      <input
        ref={pptxInput}
        type="file"
        hidden
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            void importPptx(file);
          }
        }}
      />
      <input
        ref={imageInput}
        type="file"
        hidden
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            void addPicture(file);
          }
        }}
      />
      {presenting !== null && (
        <Presenter deck={deck} start={presenting} onClose={closePresenter} />
      )}
      {printing && <SlidePrint deck={deck} onDone={endPrint} />}
    </div>
  );
};

export const slidesCss = `
  .ks-root {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    outline: none;
  }
  .ks-loading {
    padding: 40px;
    color: #6b7080;
    text-align: center;
  }
  .ks-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .ks-list {
    width: 206px;
    flex: 0 0 206px;
    overflow-y: auto;
    padding: 12px 8px 24px 4px;
    border-right: 1px solid #d6d9e0;
    background: var(--c--contextuals--background--surface--secondary, #f6f7f9);
    outline: none;
  }
  .ks-thumb-row {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    margin-bottom: 10px;
    border-top: 3px solid transparent;
  }
  .ks-thumb-row.ks-drop-before { border-top-color: #2466b0; }
  .ks-drop-end { height: 3px; background: #2466b0; margin: -6px 0 8px 22px; }
  .ks-thumb-number {
    width: 18px;
    text-align: right;
    font-size: 12px;
    color: #6b7080;
    padding-top: 4px;
  }
  .ks-thumb {
    position: relative;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 4px;
    background: none;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
    line-height: 0;
  }
  .ks-thumb:hover { border-color: #a9c2e6; }
  .ks-thumb-active, .ks-thumb-active:hover { border-color: #2466b0; }
  .ks-thumb-people {
    position: absolute;
    right: 3px;
    bottom: 3px;
    display: flex;
    gap: 2px;
  }
  .ks-person {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    color: #fff;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
    font-weight: 600;
  }
  .ks-thumb-notes {
    position: absolute;
    left: 3px;
    bottom: 3px;
    font-size: 13px !important;
    color: #6b7080;
    background: rgba(255,255,255,0.8);
    border-radius: 2px;
  }
  .ks-add-slide {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 6px 0 0 22px;
    padding: 6px 10px;
    border: 1px dashed #a0a6b4;
    border-radius: 4px;
    background: transparent;
    color: #3b4150;
    cursor: pointer;
    font-size: 13px;
  }
  .ks-add-slide:hover { background: #e8eef8; }
  .ks-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .ks-canvas-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e9ebef;
    outline: none;
    overflow: hidden;
  }
  .ks-canvas-shadow { box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18); }
  .ks-surface { user-select: none; touch-action: none; }
  .ks-selection {
    position: absolute;
    outline: 1.5px solid #2466b0;
    pointer-events: none;
  }
  .ks-handle, .ks-rotate {
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    background: #fff;
    border: 1.5px solid #2466b0;
    border-radius: 2px;
    pointer-events: auto;
    box-sizing: border-box;
  }
  .ks-handle-nw { left: 0; top: 0; cursor: nwse-resize; }
  .ks-handle-n { left: 50%; top: 0; cursor: ns-resize; }
  .ks-handle-ne { left: 100%; top: 0; cursor: nesw-resize; }
  .ks-handle-e { left: 100%; top: 50%; cursor: ew-resize; }
  .ks-handle-se { left: 100%; top: 100%; cursor: nwse-resize; }
  .ks-handle-s { left: 50%; top: 100%; cursor: ns-resize; }
  .ks-handle-sw { left: 0; top: 100%; cursor: nesw-resize; }
  .ks-handle-w { left: 0; top: 50%; cursor: ew-resize; }
  .ks-rotate {
    left: 50%;
    top: -26px;
    border-radius: 50%;
    cursor: grab;
  }
  .ks-guide {
    position: absolute;
    background: #e5484d;
    pointer-events: none;
  }
  .ks-notes {
    height: 96px;
    flex: 0 0 96px;
    resize: vertical;
    border: none;
    border-top: 1px solid #d6d9e0;
    padding: 8px 14px;
    font: 14px var(--c--globals--font--families--base, sans-serif);
    outline: none;
  }
  .ks-drop {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 30px;
    padding: 0 4px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    color: var(--c--contextuals--content--semantic--neutral--primary);
  }
  .ks-drop:hover { background: var(--c--contextuals--background--semantic--neutral--tertiary); }
  .ks-drop .material-icons { font-size: 20px; }
  .ks-select {
    height: 28px;
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    background: #fff;
    font-size: 13px;
  }
  .ks-color-button {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    cursor: pointer;
  }
  .ks-color-button:hover { background: var(--c--contextuals--background--semantic--neutral--tertiary); }
  .ks-color-button .material-icons { font-size: 18px; }
  .ks-color-swatch {
    width: 18px;
    height: 4px;
    border: 1px solid rgba(0,0,0,0.2);
  }
  .ks-color-button input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .ks-present {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    outline: none;
    cursor: none;
  }
  .ks-present:hover { cursor: default; }
  .ks-present-bar {
    position: absolute;
    left: 16px;
    bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font: 13px sans-serif;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .ks-present:hover .ks-present-bar { opacity: 1; }
  .ks-present-bar button {
    border: none;
    background: transparent;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    padding: 2px 6px;
  }
  .ks-print-root { display: none; }
  @media print {
    body > *:not(.ks-print-root) { display: none !important; }
    .ks-print-root { display: block !important; }
    .ks-print-page {
      width: 10in;
      height: 5.625in;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;
