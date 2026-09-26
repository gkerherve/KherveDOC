import { Extension } from '@tiptap/core';
import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';

/**
 * Formatting marks, like Word's ¶ button: shows spaces (·), non-breaking
 * spaces (°), tabs (→), line breaks (↵) and paragraph ends (¶) on screen.
 * View only: nothing is written to the document, and marks never print.
 */

const STORAGE_KEY = 'kherve-formatting-marks';
const STYLE_ID = 'kherve-formatting-marks-style';
const TOGGLE = 'kherveFormattingMarksToggle';

interface MarksState {
  enabled: boolean;
  decorations: DecorationSet;
}

const marksKey = new PluginKey<MarksState>('kherveFormattingMarks');

const CHAR_CLASS: Record<string, string> = {
  ' ': 'kherve-mark-space',
  ' ': 'kherve-mark-nbsp',
  '\t': 'kherve-mark-tab',
};

const CSS = `
  @media screen {
    .kherve-marks .kherve-mark-space,
    .kherve-marks .kherve-mark-nbsp,
    .kherve-marks .kherve-mark-tab {
      position: relative;
    }
    .kherve-marks .kherve-mark-space::after,
    .kherve-marks .kherve-mark-nbsp::after,
    .kherve-marks .kherve-mark-tab::after {
      position: absolute;
      left: 0;
      right: 0;
      text-align: center;
      font-style: normal;
      font-weight: normal;
      pointer-events: none;
    }
    .kherve-marks .kherve-mark-space::after { content: '·'; }
    .kherve-marks .kherve-mark-nbsp::after { content: '°'; }
    .kherve-marks .kherve-mark-tab::after { content: '→'; }
    .kherve-marks .kherve-mark-break,
    .kherve-marks .bn-inline-content::after,
    .kherve-marks .kherve-mark-space::after,
    .kherve-marks .kherve-mark-nbsp::after,
    .kherve-marks .kherve-mark-tab::after {
      color: #3b73d9;
      opacity: 0.75;
      user-select: none;
    }
    .kherve-marks .bn-inline-content::after {
      content: '¶';
      font-style: normal;
      font-weight: normal;
      text-decoration: none;
      pointer-events: none;
    }
  }
  .kherve-mark-break {
    pointer-events: none;
  }
  @media print {
    .kherve-mark-break { display: none; }
  }
`;

export const readFormattingMarksPreference = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
};

const storePreference = (enabled: boolean) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Private windows may refuse storage; the marks still toggle.
  }
};

const breakWidget = () => {
  const mark = document.createElement('span');
  mark.className = 'kherve-mark-break';
  mark.textContent = '↵';
  return mark;
};

export const buildMarkDecorations = (doc: EditorState['doc']) => {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'hardBreak') {
      decorations.push(
        Decoration.widget(pos, breakWidget, { side: -1, key: 'break' }),
      );
      return false;
    }
    if (!node.isText || !node.text) {
      return true;
    }
    for (let index = 0; index < node.text.length; index++) {
      const char = node.text[index];
      if (char === '\n') {
        decorations.push(
          Decoration.widget(pos + index, breakWidget, {
            side: -1,
            key: 'break',
          }),
        );
      } else if (CHAR_CLASS[char]) {
        decorations.push(
          Decoration.inline(pos + index, pos + index + 1, {
            class: CHAR_CLASS[char],
          }),
        );
      }
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
};

export const formattingMarksOn = (state?: EditorState) =>
  !!state && !!marksKey.getState(state)?.enabled;

export const setFormattingMarks = (view: EditorView, enabled: boolean) => {
  storePreference(enabled);
  view.dispatch(view.state.tr.setMeta(TOGGLE, enabled));
};

export const KherveFormattingMarks = Extension.create({
  name: 'kherveFormattingMarks',

  addProseMirrorPlugins() {
    return [
      new Plugin<MarksState>({
        key: marksKey,
        state: {
          init: (_config, state) => {
            const enabled = readFormattingMarksPreference();
            return {
              enabled,
              decorations: enabled
                ? buildMarkDecorations(state.doc)
                : DecorationSet.empty,
            };
          },
          apply: (tr, value, _old, state) => {
            const toggle = tr.getMeta(TOGGLE) as boolean | undefined;
            const enabled = toggle ?? value.enabled;
            if (!enabled) {
              return value.enabled
                ? { enabled, decorations: DecorationSet.empty }
                : value;
            }
            if (toggle === undefined && !tr.docChanged) {
              return value;
            }
            return { enabled, decorations: buildMarkDecorations(state.doc) };
          },
        },
        props: {
          decorations: (state) => marksKey.getState(state)?.decorations,
          attributes: (state): Record<string, string> =>
            formattingMarksOn(state) ? { class: 'kherve-marks' } : {},
        },
        view: () => {
          if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = CSS;
            document.head.appendChild(style);
          }
          return {};
        },
      }),
    ];
  },
});
