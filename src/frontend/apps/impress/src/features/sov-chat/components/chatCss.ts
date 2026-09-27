/** The chat's look: a conversation column, bubbles-free like team chats. */
export const chatCss = `
  .sov-chat {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
  }
  .sov-chat-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--c--contextuals--border--surface--primary, #e3e5ea);
  }
  .sov-chat-people {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .sov-chat-here {
    margin-left: 6px;
    font-size: 13px;
    color: #6b7080;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sov-chat-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
  }
  .sov-chat-people .sov-chat-avatar {
    width: 26px;
    height: 26px;
    font-size: 11px;
    border: 2px solid #fff;
    margin-left: -6px;
  }
  .sov-chat-people .sov-chat-avatar:first-child {
    margin-left: 0;
  }
  .sov-chat-call {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border: none;
    border-radius: 18px;
    background: #1a73e8;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    white-space: nowrap;
  }
  .sov-chat-call-on {
    background: #d93025;
  }
  .sov-chat-call .material-icons {
    font-size: 18px;
  }
  .sov-chat-callarea {
    display: flex;
    height: min(60vh, 560px);
    padding: 8px 16px 0;
  }
  .sov-chat-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 0;
  }
  .sov-chat-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #6b7080;
    text-align: center;
    padding: 24px;
  }
  .sov-chat-empty .material-icons {
    font-size: 48px;
    color: #7b4fd6;
  }
  .sov-chat-empty p {
    margin: 6px 0 0;
  }
  .sov-chat-hint {
    font-size: 13px;
  }
  .sov-chat-day {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 16px 8px;
    font-size: 12px;
    font-weight: 600;
    color: #6b7080;
    text-transform: capitalize;
  }
  .sov-chat-day::before,
  .sov-chat-day::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e3e5ea;
  }
  .sov-chat-message {
    position: relative;
    display: flex;
    gap: 10px;
    padding: 6px 16px 2px;
  }
  .sov-chat-continued {
    padding-top: 1px;
  }
  .sov-chat-message:hover {
    background: #f6f7f9;
  }
  .sov-chat-gutter {
    flex: 0 0 32px;
    display: flex;
    justify-content: center;
  }
  .sov-chat-time-side {
    visibility: hidden;
    font-size: 10px;
    line-height: 22px;
    color: #8a8f9c;
  }
  .sov-chat-message:hover .sov-chat-time-side {
    visibility: visible;
  }
  .sov-chat-content {
    flex: 1;
    min-width: 0;
  }
  .sov-chat-meta {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 14px;
  }
  .sov-chat-meta span {
    font-size: 12px;
    color: #8a8f9c;
  }
  .sov-chat-text {
    font-size: 15px;
    line-height: 22px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .sov-chat-text a {
    color: #1a5fd0;
  }
  .sov-chat-edited,
  .sov-chat-deleted {
    font-size: 12px;
    color: #8a8f9c;
    font-style: italic;
  }
  .sov-chat-image img {
    display: block;
    max-width: min(360px, 100%);
    max-height: 280px;
    margin-top: 4px;
    border-radius: 8px;
    border: 1px solid #e3e5ea;
  }
  .sov-chat-file {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    padding: 8px 12px;
    border: 1px solid #e3e5ea;
    border-radius: 8px;
    color: inherit;
    text-decoration: none;
    background: #fff;
  }
  .sov-chat-file small {
    display: block;
    color: #8a8f9c;
  }
  .sov-chat-reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .sov-chat-reactions button {
    padding: 1px 8px;
    border: 1px solid #e3e5ea;
    border-radius: 12px;
    background: #fff;
    font-size: 13px;
    cursor: pointer;
  }
  .sov-chat-reactions .sov-chat-mine {
    border-color: #1a73e8;
    background: #e8f0fe;
  }
  .sov-chat-actions {
    position: absolute;
    top: -12px;
    right: 16px;
    display: none;
    gap: 2px;
    padding: 2px;
    background: #fff;
    border: 1px solid #e3e5ea;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }
  .sov-chat-message:hover .sov-chat-actions,
  .sov-chat-actions:focus-within {
    display: flex;
  }
  .sov-chat-actions > button {
    display: inline-flex;
    padding: 3px;
    border: none;
    background: none;
    border-radius: 4px;
    cursor: pointer;
    color: #4a4f5b;
  }
  .sov-chat-actions > button:hover {
    background: #eef0f3;
  }
  .sov-chat-actions .material-icons {
    font-size: 18px;
  }
  .sov-chat-picker {
    position: absolute;
    top: 100%;
    right: 0;
    display: flex;
    gap: 2px;
    padding: 4px;
    background: #fff;
    border: 1px solid #e3e5ea;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    z-index: 2;
  }
  .sov-chat-picker button {
    border: none;
    background: none;
    font-size: 20px;
    cursor: pointer;
    border-radius: 4px;
  }
  .sov-chat-picker button:hover {
    background: #eef0f3;
  }
  .sov-chat-edit textarea {
    width: 100%;
    min-height: 60px;
    padding: 6px 8px;
    font: inherit;
    border: 1px solid #1a73e8;
    border-radius: 6px;
  }
  .sov-chat-edit div {
    display: flex;
    gap: 6px;
  }
  .sov-chat-typing {
    min-height: 18px;
    padding: 0 16px;
    font-size: 12px;
    color: #6b7080;
  }
  .sov-chat-readonly {
    padding: 12px 16px;
    font-size: 14px;
    color: #6b7080;
    text-align: center;
  }
  .sov-chat-composer {
    padding: 4px 16px 16px;
  }
  .sov-chat-problem {
    margin-bottom: 6px;
    font-size: 13px;
    color: #d93025;
  }
  .sov-chat-inputrow {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 6px;
    border: 1px solid #d0d4dc;
    border-radius: 10px;
    background: #fff;
  }
  .sov-chat-inputrow:focus-within {
    border-color: #1a73e8;
  }
  .sov-chat-inputrow textarea {
    flex: 1;
    min-height: 24px;
    max-height: 160px;
    padding: 6px 4px;
    border: none;
    outline: none;
    resize: none;
    font: inherit;
    font-size: 15px;
    field-sizing: content;
  }
  .sov-chat-attach,
  .sov-chat-send {
    display: inline-flex;
    padding: 6px;
    border: none;
    border-radius: 6px;
    background: none;
    color: #4a4f5b;
    cursor: pointer;
  }
  .sov-chat-send {
    background: #1a73e8;
    color: #fff;
  }
  .sov-chat-send:disabled {
    background: #c9d4e8;
    cursor: default;
  }
`;
