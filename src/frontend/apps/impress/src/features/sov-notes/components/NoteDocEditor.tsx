/**
 * A note's page: its title in the window's top bar, then a sheet of paper
 * holding the note's text (the text editor, without the Word toolbar or
 * pages) with the handwriting layer over it. "Type" edits the text, "Pen"
 * draws on top of it.
 */
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from 'styled-components';

import { Box } from '@/components';
import {
  BlockNoteEditor,
  BlockNoteReader,
} from '@/docs/doc-editor/components/BlockNoteEditor';
import { KHERVE_TITLE_SLOT_ID } from '@/docs/doc-editor/components/SovToolbar/slot';
import { DocHeader } from '@/docs/doc-header/';
import { Doc, useProviderStore } from '@/docs/doc-management';
import { SkeletonEditorCore } from '@/features/skeletons';

import { useNoteInk } from '../hooks';

import { InkCanvas, PenTool, inkHeight } from './InkCanvas';
import { NoteToolbar, PEN_COLORS, PEN_SIZES } from './NoteToolbar';

interface NoteDocEditorProps {
  doc: Doc;
  readOnly: boolean;
}

export const NoteDocEditor = ({ doc, readOnly }: NoteDocEditorProps) => {
  const { provider, isReady } = useProviderStore();
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTitleSlot(document.getElementById(KHERVE_TITLE_SLOT_ID));
  }, []);

  const ready = isReady && provider?.configuration.name === doc.id;
  const header = <DocHeader doc={doc} />;

  return (
    <Box
      $width="100%"
      $flex="1"
      $css="display: flex; flex-direction: column; min-height: 0;"
      className="--docs--note-editor"
    >
      {titleSlot ? createPortal(header, titleSlot) : header}
      {ready && provider ? (
        <NoteBody doc={doc} provider={provider} readOnly={readOnly} />
      ) : (
        <SkeletonEditorCore />
      )}
    </Box>
  );
};

const paperCss = css`
  position: relative;
  width: 100%;
  max-width: 800px;
  margin: 16px auto 48px;
  background: #fff;
  border-radius: 4px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.08),
    0 4px 16px rgba(0, 0, 0, 0.06);
  /* The text editor's own side padding is for a wide page. */
  .--docs--main-editor .bn-editor {
    padding-inline: 40px;
  }
  @media (max-width: 600px) {
    margin-top: 0;
    border-radius: 0;
    .--docs--main-editor .bn-editor {
      padding-inline: 16px;
    }
  }
`;

const NoteBody = ({
  doc,
  provider,
  readOnly,
}: {
  doc: Doc;
  provider: HocuspocusProvider;
  readOnly: boolean;
}) => {
  const { ink, version } = useNoteInk(provider);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<PenTool>('pen');
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [size, setSize] = useState(PEN_SIZES[0]);
  const paperRef = useRef<HTMLDivElement>(null);
  const [paperWidth, setPaperWidth] = useState(800);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) {
      return;
    }
    const observer = new ResizeObserver(() =>
      setPaperWidth(paper.clientWidth || 800),
    );
    observer.observe(paper);
    return () => observer.disconnect();
  }, []);

  // Ctrl/Cmd+Z undoes the drawing while the pen is out (the text has its
  // own undo while typing).
  useEffect(() => {
    if (!drawing || !ink) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          ink.redo();
        } else {
          ink.undo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing, ink]);

  const penWidth = tool === 'highlighter' ? size * 4 + 10 : size;

  return (
    <Box $css="flex: 1; overflow: auto; padding: 0 16px;">
      {ink && (
        <NoteToolbar
          readOnly={readOnly}
          drawing={drawing}
          onDrawing={setDrawing}
          tool={tool}
          onTool={setTool}
          color={color}
          onColor={setColor}
          size={size}
          onSize={setSize}
          canUndo={ink.canUndo()}
          canRedo={ink.canRedo()}
          onUndo={() => ink.undo()}
          onRedo={() => ink.redo()}
          // Undo brings it back.
          onClear={() => ink.clear()}
        />
      )}
      <Box
        ref={paperRef}
        $css={paperCss}
        style={{ minHeight: ink ? inkHeight(ink, paperWidth) : 1100 }}
        data-version={version}
      >
        {readOnly ? (
          <BlockNoteReader
            initialContent={provider.document.getXmlFragment('document-store')}
            docId={doc.id}
          />
        ) : (
          <BlockNoteEditor doc={doc} provider={provider} variant="note" />
        )}
        {ink && (
          <InkCanvas
            ink={ink}
            version={version}
            drawing={drawing && !readOnly}
            tool={tool}
            color={
              tool === 'highlighter' && color === PEN_COLORS[0]
                ? '#f2c200'
                : color
            }
            width={penWidth}
          />
        )}
      </Box>
    </Box>
  );
};
