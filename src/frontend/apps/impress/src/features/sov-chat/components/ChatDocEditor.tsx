/**
 * A chat's page: its title in the window's top bar, who is here, the
 * conversation, and a box to write in. "Call" starts a video call in the
 * same room (SOV Meet), open to everyone who can open the chat.
 */
import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  ClipboardEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Box } from '@/components';
import { KHERVE_TITLE_SLOT_ID } from '@/docs/doc-editor/components/SovToolbar/slot';
import { useSaveDoc } from '@/docs/doc-editor/hook/useSaveDoc';
import { useUploadFile } from '@/docs/doc-editor/hook/useUploadFile';
import { DocHeader } from '@/docs/doc-header/';
import { Doc, useProviderStore } from '@/docs/doc-management';
import { useAuth } from '@/features/auth';
import { SkeletonEditorCore } from '@/features/skeletons';
import { MeetCall } from '@/features/sov-meet';
import { pictureDataUrl } from '@/features/sov-slides/components/SlideEditor';

import { useChatPresence, useChatRoom } from '../hooks';
import {
  ChatMessage,
  ChatRoom,
  groupMessages,
  splitLinks,
} from '../model/chat';

import { chatCss } from './chatCss';

const REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'];

/** A colour of its own for each person. */
export const personColor = (id: string) => {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360} 55% 45%)`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || '?';

export const Avatar = ({ id, name }: { id: string; name: string }) => (
  <span
    className="sov-chat-avatar"
    style={{ background: personColor(id) }}
    title={name}
    aria-hidden
  >
    {initials(name)}
  </span>
);

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

interface ChatDocEditorProps {
  doc: Doc;
  readOnly: boolean;
}

export const ChatDocEditor = ({ doc, readOnly }: ChatDocEditorProps) => {
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
      className="--docs--chat-editor"
    >
      <style>{chatCss}</style>
      {titleSlot ? createPortal(header, titleSlot) : header}
      {ready && provider ? (
        <ChatBody doc={doc} provider={provider} readOnly={readOnly} />
      ) : (
        <SkeletonEditorCore />
      )}
    </Box>
  );
};

const ChatBody = ({
  doc,
  provider,
  readOnly,
}: {
  doc: Doc;
  provider: HocuspocusProvider;
  readOnly: boolean;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  useSaveDoc(doc.id, provider.document);
  const { room, version } = useChatRoom(provider);
  const [calling, setCalling] = useState(false);
  const [typing, setTyping] = useState(false);
  const me = useMemo(
    () => ({
      id: user?.id ?? `guest-${provider.document.clientID}`,
      name: user?.full_name || user?.email || t('Guest'),
    }),
    [user, provider, t],
  );
  const others = useChatPresence(provider, {
    ...me,
    color: personColor(me.id),
    typing,
  });
  const writing = others.filter((o) => o.typing);

  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const count = room?.messages().length ?? 0;

  // Stay at the newest message, unless reading further up.
  useEffect(() => {
    const list = listRef.current;
    if (list && stick.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [count, version]);

  if (!room) {
    return <SkeletonEditorCore />;
  }

  return (
    <div className="sov-chat">
      <div className="sov-chat-bar">
        <div className="sov-chat-people">
          <Avatar id={me.id} name={me.name} />
          {others.map((o) => (
            <Avatar key={o.clientId} id={o.id} name={o.name} />
          ))}
          <span className="sov-chat-here">
            {others.length
              ? t('{{count}} other people here', { count: others.length })
              : t('Only you here right now')}
          </span>
        </div>
        <button
          type="button"
          className={`sov-chat-call${calling ? ' sov-chat-call-on' : ''}`}
          onClick={() => setCalling(!calling)}
        >
          <span className="material-icons" aria-hidden>
            {calling ? 'call_end' : 'videocam'}
          </span>
          {calling ? t('Hide the call') : t('Call')}
        </button>
      </div>
      {calling && (
        <div className="sov-chat-callarea">
          <MeetCall
            docId={doc.id}
            title={doc.title || t('Untitled chat')}
            onClose={() => setCalling(false)}
          />
        </div>
      )}
      <div
        ref={listRef}
        className="sov-chat-list"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {count === 0 && (
          <div className="sov-chat-empty">
            <span className="material-icons" aria-hidden>
              forum
            </span>
            <p>{t('No messages yet. Say hello!')}</p>
            <p className="sov-chat-hint">
              {t('Share this chat (Share, top right) to invite people.')}
            </p>
          </div>
        )}
        {groupMessages(room.messages()).map(
          ({ message, newDay, continued }) => (
            <div key={message.id}>
              {newDay && (
                <div className="sov-chat-day">
                  <span>
                    {new Date(message.at).toLocaleDateString(undefined, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </span>
                </div>
              )}
              <MessageView
                room={room}
                message={message}
                continued={continued}
                meId={me.id}
                readOnly={readOnly}
              />
            </div>
          ),
        )}
      </div>
      <div className="sov-chat-typing" aria-live="polite">
        {writing.length === 1
          ? t('{{name}} is writing…', { name: writing[0].name })
          : writing.length > 1
            ? t('Several people are writing…')
            : ''}
      </div>
      {readOnly ? (
        <div className="sov-chat-readonly">
          {t('You can read this chat but not write in it.')}
        </div>
      ) : (
        <Composer
          room={room}
          docId={doc.id}
          me={me}
          onTyping={setTyping}
          onSent={() => {
            stick.current = true;
          }}
        />
      )}
    </div>
  );
};

const MessageView = ({
  room,
  message,
  continued,
  meId,
  readOnly,
}: {
  room: ChatRoom;
  message: ChatMessage;
  continued: boolean;
  meId: string;
  readOnly: boolean;
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const mine = message.author.id === meId;
  const time = new Date(message.at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`sov-chat-message${continued ? ' sov-chat-continued' : ''}`}
    >
      <div className="sov-chat-gutter">
        {continued ? (
          <span className="sov-chat-time-side">{time}</span>
        ) : (
          <Avatar id={message.author.id} name={message.author.name} />
        )}
      </div>
      <div className="sov-chat-content">
        {!continued && (
          <div className="sov-chat-meta">
            <strong>{message.author.name}</strong>
            <span>{time}</span>
          </div>
        )}
        {message.deleted ? (
          <div className="sov-chat-deleted">{t('Message deleted')}</div>
        ) : editing !== null ? (
          <form
            className="sov-chat-edit"
            onSubmit={(e) => {
              e.preventDefault();
              if (editing.trim()) {
                room.edit(message.id, editing.trim());
              }
              setEditing(null);
            }}
          >
            <textarea
              value={editing}
              aria-label={t('Edit the message')}
              autoFocus
              onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setEditing(null);
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div>
              <button type="submit">{t('Save')}</button>
              <button type="button" onClick={() => setEditing(null)}>
                {t('Cancel')}
              </button>
            </div>
          </form>
        ) : (
          <>
            {message.text && (
              <div className="sov-chat-text">
                {splitLinks(message.text).map((part, i) =>
                  part.link ? (
                    <a
                      key={i}
                      href={part.text}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {part.text}
                    </a>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
                {message.edited && (
                  <span className="sov-chat-edited"> {t('(edited)')}</span>
                )}
              </div>
            )}
            {message.image && (
              <a
                href={message.image}
                target="_blank"
                rel="noopener noreferrer"
                className="sov-chat-image"
              >
                <img src={message.image} alt={t('Picture')} />
              </a>
            )}
            {message.file && (
              <a
                className="sov-chat-file"
                href={message.file.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="material-icons" aria-hidden>
                  description
                </span>
                <span>
                  {message.file.name}
                  <small>{formatSize(message.file.size)}</small>
                </span>
              </a>
            )}
          </>
        )}
        {!message.deleted && message.reactions && (
          <div className="sov-chat-reactions">
            {Object.entries(message.reactions).map(([emoji, who]) => (
              <button
                key={emoji}
                type="button"
                className={who.includes(meId) ? 'sov-chat-mine' : undefined}
                disabled={readOnly}
                onClick={() => room.react(message.id, emoji, meId)}
              >
                {emoji} {who.length}
              </button>
            ))}
          </div>
        )}
      </div>
      {!readOnly && !message.deleted && editing === null && (
        <div className="sov-chat-actions">
          <button
            type="button"
            aria-label={t('React')}
            title={t('React')}
            onClick={() => setPicking(!picking)}
          >
            <span className="material-icons">add_reaction</span>
          </button>
          {mine && (
            <>
              <button
                type="button"
                aria-label={t('Edit')}
                title={t('Edit')}
                onClick={() => setEditing(message.text)}
              >
                <span className="material-icons">edit</span>
              </button>
              <button
                type="button"
                aria-label={t('Delete')}
                title={t('Delete')}
                onClick={() => room.remove(message.id)}
              >
                <span className="material-icons">delete</span>
              </button>
            </>
          )}
          {picking && (
            <div className="sov-chat-picker">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    room.react(message.id, emoji, meId);
                    setPicking(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Composer = ({
  room,
  docId,
  me,
  onTyping,
  onSent,
}: {
  room: ChatRoom;
  docId: string;
  me: { id: string; name: string };
  onTyping: (typing: boolean) => void;
  onSent: () => void;
}) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const { uploadFile } = useUploadFile(docId);

  useEffect(() => () => window.clearTimeout(typingTimer.current), []);

  const send = () => {
    if (room.send(me, { text })) {
      setText('');
      onTyping(false);
      onSent();
    }
  };

  const attach = async (file: File) => {
    setBusy(true);
    setProblem('');
    try {
      if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
        const { src } = await pictureDataUrl(file);
        room.send(me, { text, image: src });
      } else {
        const url = await uploadFile(file);
        room.send(me, {
          text,
          file: { name: file.name, url, size: file.size },
        });
      }
      setText('');
      onSent();
    } catch {
      setProblem(t('{{name}} could not be sent.', { name: file.name }));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files)[0];
    if (file) {
      e.preventDefault();
      void attach(file);
    }
  };

  return (
    <div className="sov-chat-composer">
      {problem && (
        <div className="sov-chat-problem" role="alert">
          {problem}
        </div>
      )}
      <div className="sov-chat-inputrow">
        <button
          type="button"
          className="sov-chat-attach"
          aria-label={t('Send a picture or a file')}
          title={t('Send a picture or a file')}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <span className="material-icons">attach_file</span>
        </button>
        <textarea
          value={text}
          rows={1}
          placeholder={t('Write a message…')}
          aria-label={t('Write a message…')}
          onChange={(e) => {
            setText(e.target.value);
            onTyping(!!e.target.value);
            window.clearTimeout(typingTimer.current);
            typingTimer.current = window.setTimeout(
              () => onTyping(false),
              4000,
            );
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <button
          type="button"
          className="sov-chat-send"
          aria-label={t('Send')}
          title={t('Send (Enter)')}
          disabled={busy || !text.trim()}
          onClick={send}
        >
          <span className="material-icons">send</span>
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            void attach(file);
          }
        }}
      />
    </div>
  );
};
