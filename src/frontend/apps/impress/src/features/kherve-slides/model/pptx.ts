/**
 * PowerPoint files: writing a presentation as .pptx (with PptxGenJS) and
 * reading the slides of a .pptx (its XML, with JSZip): text boxes and
 * placeholders, shapes, pictures, tables (as text), backgrounds and
 * speaker notes. Animations, charts and SmartArt are left out.
 */
import type JSZip from 'jszip';

import type { ImportedSlide, SlideDeck } from './deck';
import type { NewElement } from './layouts';
import { Theme } from './themes';
import {
  SLIDE_H,
  SLIDE_W,
  ShapeKind,
  SlideElement,
  TextStyle,
  effectiveStyle,
} from './types';

// ── Writing ──────────────────────────────────────────────────────────
const PX_PER_IN = 96;
const inch = (px: number) => px / PX_PER_IN;
const hex = (color?: string) =>
  color && color !== 'none' ? color.replace('#', '').toUpperCase() : undefined;
const pt = (px: number) => Math.round(px * 0.75 * 10) / 10;

/** A font PowerPoint has everywhere, for a CSS font list. */
const officeFont = (family?: string) => {
  const first = (family ?? '').split(',')[0].replace(/["']/g, '').trim();
  if (!first || first === 'Inter' || /sans/i.test(first)) {
    return 'Arial';
  }
  return first;
};

const PPTX_SHAPES: Record<ShapeKind, string> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  arrowRight: 'rightArrow',
  star: 'star5',
  line: 'line',
  arrow: 'line',
};

const textOptions = (el: SlideElement, theme: Theme) => {
  const style = effectiveStyle(el);
  return {
    fontSize: pt(style.size ?? 24),
    bold: !!style.bold,
    italic: !!style.italic,
    underline: style.underline ? { style: 'sng' as const } : undefined,
    color: hex(
      style.color ?? (el.role === 'title' ? theme.titleColor : theme.textColor),
    ),
    fontFace: officeFont(
      style.font ?? (el.role === 'title' ? theme.titleFont : theme.font),
    ),
    align: style.align,
    valign: style.valign,
    margin: 4,
  };
};

const textRuns = (el: SlideElement) => {
  const style = el.style ?? {};
  const lines = (el.text ?? '').split('\n');
  return lines.map((line, i) => ({
    text: line,
    options: {
      bullet: style.numbered
        ? { type: 'number' as const }
        : style.bullets && line.trim()
          ? true
          : undefined,
      breakLine: i < lines.length - 1,
    },
  }));
};

/** The presentation as a .pptx file. */
export const writePptx = async (deck: SlideDeck, title: string) => {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = title;
  pptx.company = 'KherveDOC';
  const theme = deck.theme();
  for (const { id, meta } of deck.slides()) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(meta.background ?? theme.background) };
    for (const { el } of deck.elements(id)) {
      const box = {
        x: inch(el.x),
        y: inch(el.y),
        w: inch(Math.max(1, el.w)),
        h: inch(Math.max(1, el.h)),
        rotate: el.rotation || undefined,
      };
      if (el.type === 'image' && el.src) {
        slide.addImage({ data: el.src, ...box });
      } else if (el.type === 'shape' && el.shape) {
        const line = el.shape === 'line' || el.shape === 'arrow';
        const stroke =
          el.stroke && el.stroke !== 'none'
            ? { color: hex(el.stroke), width: pt(el.strokeWidth ?? 2) }
            : line
              ? { color: hex(theme.textColor), width: pt(el.strokeWidth ?? 3) }
              : undefined;
        const shapeBox =
          line && el.h < 16 ? { ...box, y: inch(el.y + el.h / 2), h: 0 } : box;
        const options = {
          ...shapeBox,
          shape: PPTX_SHAPES[el.shape] as never,
          fill: line
            ? undefined
            : {
                color: hex(el.fill ?? theme.accent),
                transparency:
                  el.opacity !== undefined
                    ? Math.round((1 - el.opacity) * 100)
                    : undefined,
              },
          line: stroke
            ? {
                ...stroke,
                endArrowType:
                  el.shape === 'arrow' ? ('triangle' as const) : undefined,
              }
            : undefined,
        };
        if (!line && el.text) {
          slide.addText(textRuns(el), {
            ...options,
            ...textOptions(el, theme),
          });
        } else {
          slide.addShape(PPTX_SHAPES[el.shape] as never, options);
        }
      } else if (el.type === 'text') {
        slide.addText(textRuns(el), {
          ...box,
          ...textOptions(el, theme),
          fill: el.fill ? { color: hex(el.fill) } : undefined,
        });
      }
    }
    if (meta.notes) {
      slide.addNotes(meta.notes);
    }
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
};

// ── Reading ──────────────────────────────────────────────────────────
const XML = 'application/xml';

const kids = (el: Element | null | undefined, name: string): Element[] =>
  el ? Array.from(el.children).filter((c) => c.localName === name) : [];
const kid = (el: Element | null | undefined, name: string) =>
  kids(el, name)[0] ?? null;
const path = (el: Element | null | undefined, ...names: string[]) =>
  names.reduce<Element | null>((node, name) => kid(node, name), el ?? null);
const all = (el: Element | Document | null | undefined, name: string) =>
  el ? Array.from(el.getElementsByTagNameNS('*', name)) : [];
const num = (value: string | null | undefined, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== '' ? n : fallback;
};

type Rels = Record<string, { target: string; type: string }>;

const dirOf = (file: string) => file.slice(0, file.lastIndexOf('/') + 1);

/** "../media/image1.png" seen from "ppt/slides/slide1.xml". */
const resolvePath = (from: string, target: string) => {
  if (target.startsWith('/')) {
    return target.slice(1);
  }
  const parts = (dirOf(from) + target).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      out.pop();
    } else if (part && part !== '.') {
      out.push(part);
    }
  }
  return out.join('/');
};

interface Placeholder {
  type: string;
  idx: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

type Transform = (box: Box) => Box;

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

class PptxReader {
  private zip: JSZip;
  private scale = 1;
  private themeColors: Record<string, string> = {};

  constructor(zip: JSZip) {
    this.zip = zip;
  }

  private async xml(file: string): Promise<Document | null> {
    const entry = this.zip.file(file);
    if (!entry) {
      return null;
    }
    return new DOMParser().parseFromString(await entry.async('string'), XML);
  }

  private async rels(file: string): Promise<Rels> {
    const relsFile = `${dirOf(file)}_rels/${file.slice(file.lastIndexOf('/') + 1)}.rels`;
    const doc = await this.xml(relsFile);
    const out: Rels = {};
    for (const rel of all(doc, 'Relationship')) {
      out[rel.getAttribute('Id') ?? ''] = {
        target: resolvePath(file, rel.getAttribute('Target') ?? ''),
        type: (rel.getAttribute('Type') ?? '').split('/').pop() ?? '',
      };
    }
    return out;
  }

  // ── Colours ──────────────────────────────────────────────────────
  private color(fill: Element | null): string | undefined {
    if (!fill) {
      return undefined;
    }
    const srgb = kid(fill, 'srgbClr');
    if (srgb) {
      return `#${srgb.getAttribute('val')}`;
    }
    const scheme = kid(fill, 'schemeClr');
    if (scheme) {
      const val = scheme.getAttribute('val') ?? '';
      const alias: Record<string, string> = {
        tx1: 'dk1',
        bg1: 'lt1',
        tx2: 'dk2',
        bg2: 'lt2',
      };
      return this.themeColors[alias[val] ?? val];
    }
    const sys = kid(fill, 'sysClr');
    if (sys) {
      return `#${sys.getAttribute('lastClr') ?? '000000'}`;
    }
    const preset = kid(fill, 'prstClr');
    if (preset) {
      return preset.getAttribute('val') ?? undefined;
    }
    return undefined;
  }

  private solid(parent: Element | null) {
    return this.color(kid(parent, 'solidFill'));
  }

  private async loadTheme(presentation: string, rels: Rels) {
    const themeRel = Object.values(rels).find((r) => r.type === 'theme');
    let themeFile = themeRel?.target;
    if (!themeFile) {
      // The theme hangs off the slide master.
      const master = Object.values(rels).find((r) => r.type === 'slideMaster');
      if (master) {
        const masterRels = await this.rels(master.target);
        themeFile = Object.values(masterRels).find(
          (r) => r.type === 'theme',
        )?.target;
      }
    }
    const doc = themeFile ? await this.xml(themeFile) : null;
    const scheme = all(doc, 'clrScheme')[0];
    for (const entry of Array.from(scheme?.children ?? [])) {
      const color = this.color(entry);
      if (color) {
        this.themeColors[entry.localName] = color;
      }
    }
    void presentation;
  }

  // ── Geometry ─────────────────────────────────────────────────────
  private box(xfrm: Element | null): Box | null {
    const off = kid(xfrm, 'off');
    const ext = kid(xfrm, 'ext');
    if (!off || !ext) {
      return null;
    }
    const rot = num(xfrm?.getAttribute('rot')) / 60000;
    return {
      x: num(off.getAttribute('x')) * this.scale,
      y: num(off.getAttribute('y')) * this.scale,
      w: num(ext.getAttribute('cx')) * this.scale,
      h: num(ext.getAttribute('cy')) * this.scale,
      rotation: rot || undefined,
    };
  }

  private placeholder(node: Element): Placeholder | null {
    const nv =
      kid(node, 'nvSpPr') ??
      kid(node, 'nvPicPr') ??
      kid(node, 'nvGraphicFramePr');
    const ph = path(nv, 'nvPr', 'ph');
    if (!ph) {
      return null;
    }
    return {
      type: ph.getAttribute('type') ?? 'body',
      idx: ph.getAttribute('idx') ?? '',
    };
  }

  /** The same placeholder on a layout or master slide. */
  private findPlaceholder(doc: Document | null, ph: Placeholder) {
    const shapes = all(doc, 'sp');
    const same = (sp: Element) => this.placeholder(sp);
    return (
      shapes.find((sp) => {
        const other = same(sp);
        return other && ph.idx && other.idx === ph.idx;
      }) ??
      shapes.find((sp) => {
        const other = same(sp);
        const norm = (t: string) => (t === 'ctrTitle' ? 'title' : t);
        return other && norm(other.type) === norm(ph.type);
      }) ??
      null
    );
  }

  // ── Text ─────────────────────────────────────────────────────────
  private text(
    txBody: Element | null,
    ph: Placeholder | null,
    inherited: Element[],
  ) {
    if (!txBody) {
      return null;
    }
    const paragraphs = kids(txBody, 'p');
    const lines: string[] = [];
    let first: Element | null = null;
    let align: string | null = null;
    let bullets = false;
    let numbered = false;
    let noBullets = false;
    for (const p of paragraphs) {
      let line = '';
      for (const child of Array.from(p.children)) {
        if (child.localName === 'r' || child.localName === 'fld') {
          line += kid(child, 't')?.textContent ?? '';
          first ??= kid(child, 'rPr');
        } else if (child.localName === 'br') {
          line += '\n';
        }
      }
      const pPr = kid(p, 'pPr');
      align ??= pPr?.getAttribute('algn') ?? null;
      if (kid(pPr, 'buChar')) {
        bullets = true;
      }
      if (kid(pPr, 'buAutoNum')) {
        numbered = true;
      }
      if (kid(pPr, 'buNone')) {
        noBullets = true;
      }
      lines.push(line);
    }
    while (lines.length && !lines[lines.length - 1].trim()) {
      lines.pop();
    }
    const text = lines.join('\n');
    if (!text.trim()) {
      return null;
    }
    // Run properties, else the paragraph's defaults, else the layout's.
    const sources = [
      first,
      ...paragraphs.map((p) => path(p, 'pPr', 'defRPr')),
      path(txBody, 'lstStyle', 'lvl1pPr', 'defRPr'),
      ...inherited.map((body) => path(body, 'lstStyle', 'lvl1pPr', 'defRPr')),
    ].filter((e): e is Element => !!e);
    const attr = (name: string) =>
      sources
        .map((s) => s.getAttribute(name))
        .find((v) => v !== null && v !== undefined);
    const colorOf = () => {
      for (const s of sources) {
        const c = this.solid(s);
        if (c) {
          return c;
        }
      }
      return undefined;
    };
    const isTitle = ph && (ph.type === 'title' || ph.type === 'ctrTitle');
    const sz = attr('sz');
    const sizePt = sz ? num(sz) / 100 : isTitle ? 40 : ph ? 24 : 18;
    const anchors = [txBody, ...inherited]
      .map((body) => kid(body, 'bodyPr')?.getAttribute('anchor'))
      .find(Boolean);
    const style: TextStyle = {
      // 1 pt = 12700 EMU; scale turns EMU into pixels of the slide.
      size: Math.round(sizePt * 12700 * this.scale * 10) / 10,
      bold: attr('b') === '1' || undefined,
      italic: attr('i') === '1' || undefined,
      underline: (attr('u') && attr('u') !== 'none') || undefined,
      color: colorOf(),
      align: align === 'ctr' ? 'center' : align === 'r' ? 'right' : undefined,
      valign:
        anchors === 'ctr'
          ? 'middle'
          : anchors === 'b'
            ? 'bottom'
            : isTitle
              ? 'middle'
              : 'top',
      numbered: numbered || undefined,
      bullets:
        !numbered &&
        !noBullets &&
        (bullets ||
          (!!ph && !isTitle && ph.type !== 'subTitle' && lines.length > 1))
          ? true
          : undefined,
    };
    const latin = sources
      .map((s) => kid(s, 'latin')?.getAttribute('typeface'))
      .find(Boolean);
    if (latin && !latin.startsWith('+')) {
      style.font = latin;
    }
    return { text, style };
  }

  // ── Shapes on a slide ────────────────────────────────────────────
  private async readTree(
    tree: Element,
    file: string,
    rels: Rels,
    layout: Document | null,
    master: Document | null,
    transform: Transform,
    out: NewElement[],
  ) {
    for (const node of Array.from(tree.children)) {
      const name = node.localName;
      if (name === 'grpSp') {
        const xfrm = path(node, 'grpSpPr', 'xfrm');
        const off = kid(xfrm, 'off');
        const ext = kid(xfrm, 'ext');
        const chOff = kid(xfrm, 'chOff');
        const chExt = kid(xfrm, 'chExt');
        let inner = transform;
        if (off && ext && chOff && chExt) {
          const s = this.scale;
          const ox = num(off.getAttribute('x')) * s;
          const oy = num(off.getAttribute('y')) * s;
          const cx = num(chOff.getAttribute('x')) * s;
          const cy = num(chOff.getAttribute('y')) * s;
          const fx =
            num(ext.getAttribute('cx')) / (num(chExt.getAttribute('cx')) || 1);
          const fy =
            num(ext.getAttribute('cy')) / (num(chExt.getAttribute('cy')) || 1);
          inner = (b) =>
            transform({
              ...b,
              x: ox + (b.x - cx) * fx,
              y: oy + (b.y - cy) * fy,
              w: b.w * fx,
              h: b.h * fy,
            });
        }
        await this.readTree(node, file, rels, layout, master, inner, out);
      } else if (name === 'sp' || name === 'cxnSp') {
        this.readShape(node, layout, master, transform, out);
      } else if (name === 'pic') {
        await this.readPicture(node, rels, transform, out);
      } else if (name === 'graphicFrame') {
        this.readTable(node, transform, out);
      }
    }
    void file;
  }

  private readShape(
    node: Element,
    layout: Document | null,
    master: Document | null,
    transform: Transform,
    out: NewElement[],
  ) {
    const ph = this.placeholder(node);
    const spPr = kid(node, 'spPr');
    const inheritedShapes = ph
      ? [
          this.findPlaceholder(layout, ph),
          this.findPlaceholder(master, ph),
        ].filter((e): e is Element => !!e)
      : [];
    let box = this.box(kid(spPr, 'xfrm'));
    for (const shape of inheritedShapes) {
      box ??= this.box(path(shape, 'spPr', 'xfrm'));
    }
    if (!box) {
      return;
    }
    box = transform(box);
    const text = this.text(
      kid(node, 'txBody'),
      ph,
      inheritedShapes
        .map((s) => kid(s, 'txBody'))
        .filter((e): e is Element => !!e),
    );
    const geom =
      path(spPr, 'prstGeom')?.getAttribute('prst') ??
      (node.localName === 'cxnSp' ? 'line' : 'rect');
    const fill = kid(spPr, 'noFill') ? undefined : this.solid(spPr);
    const ln = kid(spPr, 'ln');
    const stroke = ln && !kid(ln, 'noFill') ? this.solid(ln) : undefined;
    const strokeWidth = ln?.getAttribute('w')
      ? Math.max(1, num(ln.getAttribute('w')) * this.scale)
      : undefined;
    const role = ph
      ? ph.type === 'title' || ph.type === 'ctrTitle'
        ? 'title'
        : ph.type === 'subTitle'
          ? 'subtitle'
          : 'body'
      : undefined;
    // A line with an arrowhead at either end.
    const headed = ['tailEnd', 'headEnd'].some((end) => {
      const type = kid(ln, end)?.getAttribute('type');
      return !!type && type !== 'none';
    });
    const kinds: Record<string, ShapeKind> = {
      rect: 'rect',
      roundRect: 'roundRect',
      snipRoundRect: 'roundRect',
      ellipse: 'ellipse',
      triangle: 'triangle',
      diamond: 'diamond',
      rightArrow: 'arrowRight',
      star5: 'star',
      line: headed ? 'arrow' : 'line',
      straightConnector1: headed ? 'arrow' : 'line',
      bentConnector3: headed ? 'arrow' : 'line',
    };
    const kind = kinds[geom] ?? 'rect';
    const isLine = kind === 'line' || kind === 'arrow';
    const base = {
      x: box.x,
      y: box.y,
      w: Math.max(isLine ? 1 : 4, box.w),
      h: isLine && box.h < 1 ? 4 : Math.max(isLine ? 1 : 4, box.h),
      rotation: box.rotation,
    };
    if (isLine) {
      out.push({
        type: 'shape',
        shape: kind,
        ...base,
        stroke: stroke ?? '#333333',
        strokeWidth: strokeWidth ?? 2,
      });
    } else if (fill || stroke) {
      out.push({
        type: 'shape',
        shape: kind,
        ...base,
        fill: fill ?? 'transparent',
        stroke: stroke ?? 'none',
        strokeWidth,
        role,
        text: text?.text,
        style: text?.style,
      });
    } else if (text) {
      out.push({
        type: 'text',
        ...base,
        role,
        text: text.text,
        style: text.style,
      });
    }
  }

  private async readPicture(
    node: Element,
    rels: Rels,
    transform: Transform,
    out: NewElement[],
  ) {
    const blip = all(node, 'blip')[0];
    const embed =
      blip?.getAttribute('r:embed') ??
      blip?.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'embed',
      );
    const target = embed ? rels[embed]?.target : undefined;
    const box = this.box(path(node, 'spPr', 'xfrm'));
    if (!target || !box) {
      return;
    }
    const ext = target.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME[ext];
    const entry = this.zip.file(target);
    if (!mime || !entry) {
      return;
    }
    const data = await entry.async('base64');
    out.push({
      type: 'image',
      ...transform(box),
      src: `data:${mime};base64,${data}`,
    });
  }

  private readTable(node: Element, transform: Transform, out: NewElement[]) {
    const table = all(node, 'tbl')[0];
    const box = this.box(kid(node, 'xfrm'));
    if (!table || !box) {
      return;
    }
    const rows = all(table, 'tr').map((tr) =>
      all(tr, 'tc')
        .map((tc) =>
          all(tc, 't')
            .map((t) => t.textContent ?? '')
            .join(''),
        )
        .join('   |   '),
    );
    out.push({
      type: 'text',
      ...transform(box),
      text: rows.join('\n'),
      style: {
        size: Math.max(
          12,
          Math.min(22, box.h / Math.max(rows.length, 1) / 1.8),
        ),
      },
    });
  }

  private async notes(rels: Rels) {
    const rel = Object.values(rels).find((r) => r.type === 'notesSlide');
    const doc = rel ? await this.xml(rel.target) : null;
    for (const sp of all(doc, 'sp')) {
      const ph = this.placeholder(sp);
      if (ph?.type === 'body') {
        return kids(kid(sp, 'txBody'), 'p')
          .map((p) =>
            all(p, 't')
              .map((t) => t.textContent ?? '')
              .join(''),
          )
          .join('\n')
          .trim();
      }
    }
    return undefined;
  }

  private background(doc: Document | null) {
    const bgPr = all(doc, 'bgPr')[0];
    return this.solid(bgPr ?? null);
  }

  async read(): Promise<ImportedSlide[]> {
    const presentationFile = 'ppt/presentation.xml';
    const presentation = await this.xml(presentationFile);
    if (!presentation) {
      throw new Error('Not a PowerPoint file');
    }
    const size = all(presentation, 'sldSz')[0];
    const cx = num(size?.getAttribute('cx'), 12192000);
    const cy = num(size?.getAttribute('cy'), 6858000);
    // Fit the file's slide size into the 960 × 540 slide.
    this.scale = Math.min(SLIDE_W / cx, SLIDE_H / cy);
    const rels = await this.rels(presentationFile);
    await this.loadTheme(presentationFile, rels);
    const order = all(presentation, 'sldId').map(
      (s) =>
        s.getAttribute('r:id') ??
        s.getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'id',
        ) ??
        '',
    );
    const slides: ImportedSlide[] = [];
    for (const relId of order) {
      const file = rels[relId]?.target;
      const doc = file ? await this.xml(file) : null;
      if (!file || !doc) {
        continue;
      }
      if (doc.documentElement.getAttribute('show') === '0') {
        continue; // hidden slide
      }
      const slideRels = await this.rels(file);
      const layoutFile = Object.values(slideRels).find(
        (r) => r.type === 'slideLayout',
      )?.target;
      const layout = layoutFile ? await this.xml(layoutFile) : null;
      const layoutRels = layoutFile ? await this.rels(layoutFile) : {};
      const masterFile = Object.values(layoutRels).find(
        (r) => r.type === 'slideMaster',
      )?.target;
      const master = masterFile ? await this.xml(masterFile) : null;
      const elements: NewElement[] = [];
      const tree = all(doc, 'spTree')[0];
      if (tree) {
        await this.readTree(
          tree,
          file,
          slideRels,
          layout,
          master,
          (b) => b,
          elements,
        );
      }
      slides.push({
        background:
          this.background(doc) ??
          this.background(layout) ??
          this.background(master),
        notes: await this.notes(slideRels),
        elements,
      });
    }
    return slides;
  }
}

/** The slides of a .pptx file. */
export const readPptx = async (data: ArrayBuffer): Promise<ImportedSlide[]> => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(data);
  return new PptxReader(zip).read();
};
