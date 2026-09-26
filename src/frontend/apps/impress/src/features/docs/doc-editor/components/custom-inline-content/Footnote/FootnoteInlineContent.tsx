import { StyleSchema } from '@blocknote/core';
import { createReactInlineContentSpec } from '@blocknote/react';
import { KeyboardEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createGlobalStyle } from 'styled-components';

export type FootnoteInlineContentType = {
  type: 'footnote';
  propSchema: { text: { default: '' } };
  content: 'none';
};

const MAX_FOOTNOTE_LENGTH = 2000;

/** Markers are numbered by a CSS counter, so they renumber themselves. */
export const FootnoteStyle = createGlobalStyle`
  .bn-editor {
    counter-reset: kherve-footnote;
  }
  .--docs--footnote {
    position: relative;
    display: inline;
  }
  .--docs--footnote-marker {
    font-size: 0.72em;
    line-height: 0;
    vertical-align: super;
    padding: 0 1px;
    color: var(--c--contextuals--content--semantic--brand--primary);
    cursor: pointer;
    user-select: none;
  }
  .--docs--footnote-marker::before {
    counter-increment: kherve-footnote;
    content: counter(kherve-footnote);
  }
  .--docs--footnote-marker[data-empty='true'] {
    color: var(--c--contextuals--content--semantic--error--primary, #b3261e);
  }
  .--docs--footnote-editor {
    position: absolute;
    z-index: 30;
    top: 1.6em;
    left: 0;
    display: flex;
    gap: 4px;
    padding: 6px;
    border: 1px solid var(--c--contextuals--border--surface--primary);
    border-radius: 6px;
    background: var(--c--contextuals--background--surface--primary);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  }
  .--docs--footnote-editor textarea {
    width: 320px;
    min-height: 56px;
    padding: 6px 8px;
    border: 1px solid var(--c--contextuals--border--surface--primary);
    border-radius: 4px;
    font: inherit;
    font-size: 14px;
    resize: vertical;
  }
`;

const FootnoteMarker = ({
  text,
  editable,
  onChange,
}: {
  text: string;
  editable: boolean;
  onChange: (text: string) => void;
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(editable && !text);
  const [draft, setDraft] = useState(text);

  const commit = () => {
    setIsEditing(false);
    const value = draft.trim().slice(0, MAX_FOOTNOTE_LENGTH);
    if (value !== text) {
      onChange(value);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Keep the editor from handling keys typed into the note.
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      setDraft(text);
      setIsEditing(false);
    }
  };

  return (
    <span className="--docs--footnote" contentEditable={false}>
      <span
        className="--docs--footnote-marker"
        role="button"
        tabIndex={0}
        data-empty={!text}
        title={text || t('Empty footnote')}
        aria-label={t('Footnote: {{text}}', { text })}
        onClick={() => {
          if (editable) {
            setDraft(text);
            setIsEditing(true);
          }
        }}
      />
      {isEditing && (
        <span className="--docs--footnote-editor">
          <textarea
            autoFocus
            aria-label={t('Footnote text')}
            placeholder={t('Footnote text')}
            value={draft}
            maxLength={MAX_FOOTNOTE_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
          />
        </span>
      )}
    </span>
  );
};

export const FootnoteInlineContent = createReactInlineContentSpec<
  FootnoteInlineContentType,
  StyleSchema
>(
  {
    type: 'footnote',
    propSchema: { text: { default: '' } },
    content: 'none',
  },
  {
    render: (props) => (
      <FootnoteMarker
        text={props.inlineContent.props.text}
        editable={props.editor.isEditable}
        onChange={(text) =>
          props.updateInlineContent({ type: 'footnote', props: { text } })
        }
      />
    ),
    // Exported HTML has no counters: keep the note readable inline.
    toExternalHTML: (props) => (
      <small className="footnote">[{props.inlineContent.props.text}]</small>
    ),
  },
);
