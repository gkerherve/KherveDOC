/**
 * A chat's conversation, kept in the chat's shared Yjs document: a list of
 * messages (one JSON message per entry), synchronised live by the same
 * collaboration server as documents, and shared the way documents are.
 */
import * as Y from 'yjs';

export const MESSAGES = 'chat-messages';

/** Transactions made by this window. */
export const LOCAL_ORIGIN = 'sov-chat-local';

export interface ChatAuthor {
  id: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  author: ChatAuthor;
  text: string;
  /** When it was sent (ms since 1970). */
  at: number;
  edited?: number;
  deleted?: boolean;
  /** A picture (a data: URL, made small enough to keep). */
  image?: string;
  /** A file uploaded to the server. */
  file?: { name: string; url: string; size: number };
  /** Emoji → the ids of who reacted with it. */
  reactions?: Record<string, string[]>;
}

const newId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const parse = (json: string): ChatMessage | undefined => {
  try {
    const message = JSON.parse(json) as ChatMessage;
    return message && typeof message.id === 'string' ? message : undefined;
  } catch {
    return undefined;
  }
};

export class ChatRoom {
  readonly ydoc: Y.Doc;
  readonly yMessages: Y.Array<string>;
  private version = 0;
  private cache?: ChatMessage[];
  private listeners = new Set<() => void>();

  constructor(ydoc: Y.Doc) {
    this.ydoc = ydoc;
    this.yMessages = ydoc.getArray<string>(MESSAGES);
    this.yMessages.observe(this.changed);
  }

  dispose() {
    this.yMessages.unobserve(this.changed);
    this.listeners.clear();
  }

  private changed = () => {
    this.cache = undefined;
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;

  /** Every message, oldest first. */
  messages(): ChatMessage[] {
    if (!this.cache) {
      const list: ChatMessage[] = [];
      this.yMessages.forEach((json) => {
        const message = parse(json);
        if (message) {
          list.push(message);
        }
      });
      this.cache = list;
    }
    return this.cache;
  }

  send(
    author: ChatAuthor,
    content: Pick<ChatMessage, 'text' | 'image' | 'file'>,
  ): string | undefined {
    const text = content.text.trim();
    if (!text && !content.image && !content.file) {
      return undefined;
    }
    const message: ChatMessage = {
      id: newId(),
      author,
      at: Date.now(),
      ...content,
      text,
    };
    this.ydoc.transact(() => {
      this.yMessages.push([JSON.stringify(message)]);
    }, LOCAL_ORIGIN);
    return message.id;
  }

  /** Change one message in place. */
  private update(id: string, change: (message: ChatMessage) => ChatMessage) {
    this.ydoc.transact(() => {
      const index = this.yMessages
        .toArray()
        .findIndex((json) => parse(json)?.id === id);
      const message = index >= 0 ? parse(this.yMessages.get(index)) : undefined;
      if (message) {
        this.yMessages.delete(index, 1);
        this.yMessages.insert(index, [JSON.stringify(change(message))]);
      }
    }, LOCAL_ORIGIN);
  }

  edit(id: string, text: string) {
    this.update(id, (message) => ({ ...message, text, edited: Date.now() }));
  }

  /** The message stays (as "deleted") so the conversation keeps its shape. */
  remove(id: string) {
    this.update(id, ({ id: _, author, at }) => ({
      id,
      author,
      at,
      text: '',
      deleted: true,
    }));
  }

  /** Add this person's reaction, or take it back if they had it. */
  react(id: string, emoji: string, userId: string) {
    this.update(id, (message) => {
      const reactions = { ...(message.reactions ?? {}) };
      const who = reactions[emoji] ?? [];
      const next = who.includes(userId)
        ? who.filter((u) => u !== userId)
        : [...who, userId];
      if (next.length) {
        reactions[emoji] = next;
      } else {
        delete reactions[emoji];
      }
      return { ...message, reactions };
    });
  }
}

/** Links in a message's text, for showing them clickable. */
export const splitLinks = (text: string) =>
  text
    .split(/(https?:\/\/[^\s<>"]+)/g)
    .map((part, i) => ({ text: part, link: i % 2 === 1 }));

const sameDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString();

/** Messages grouped for display: a day line when the day changes, and
 * the author's name only on the first of their messages in a row. */
export const groupMessages = (messages: ChatMessage[]) =>
  messages.map((message, i) => {
    const previous = messages[i - 1];
    const newDay = !previous || !sameDay(previous.at, message.at);
    const continued =
      !newDay &&
      previous.author.id === message.author.id &&
      message.at - previous.at < 5 * 60 * 1000;
    return { message, newDay, continued };
  });
