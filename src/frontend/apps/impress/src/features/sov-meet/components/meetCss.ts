/** The call's look: a dark stage, tiles, and a bar of round buttons. */
export const meetCss = `
  .sov-meet {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 420px;
    height: 100%;
    background: #1b1d22;
    color: #fff;
    border-radius: 8px;
    overflow: hidden;
  }
  .sov-meet-stage {
    flex: 1;
    display: flex;
    gap: 8px;
    padding: 8px;
    min-height: 0;
  }
  .sov-meet-grid {
    flex: 1;
    display: grid;
    gap: 8px;
    align-content: center;
    min-height: 0;
  }
  .sov-meet-grid-side {
    flex: 0 0 220px;
    grid-template-columns: 1fr;
    align-content: start;
    overflow-y: auto;
  }
  .sov-meet-tile {
    position: relative;
    aspect-ratio: 16 / 9;
    background: #2b2e36;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid transparent;
  }
  .sov-meet-screen {
    flex: 1;
    aspect-ratio: auto;
  }
  .sov-meet-speaking {
    border-color: #4caf50;
  }
  .sov-meet-tile video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .sov-meet-screen video {
    object-fit: contain;
  }
  .sov-meet-mirror {
    transform: scaleX(-1);
  }
  .sov-meet-avatar {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    font-weight: 600;
    color: #fff;
    background: radial-gradient(circle, #3d5a9e 0 36px, transparent 37px);
  }
  .sov-meet-name {
    position: absolute;
    left: 8px;
    bottom: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: 13px;
    background: rgba(0, 0, 0, 0.55);
    border-radius: 4px;
  }
  .sov-meet-name .material-icons {
    font-size: 16px;
    color: #ff8a80;
  }
  .sov-meet-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px;
    background: #14161a;
  }
  .sov-meet-count {
    position: absolute;
    left: 16px;
    font-size: 13px;
    color: #b8bcc6;
  }
  .sov-meet-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 48px;
    height: 48px;
    padding: 0 12px;
    border: none;
    border-radius: 24px;
    background: #3a3e48;
    color: #fff;
    font-size: 15px;
    cursor: pointer;
  }
  .sov-meet-button:hover {
    background: #4a4f5b;
  }
  .sov-meet-button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .sov-meet-off {
    background: #d93025;
  }
  .sov-meet-off:hover {
    background: #e04a40;
  }
  .sov-meet-active {
    background: #1a73e8;
  }
  .sov-meet-leave {
    background: #d93025;
    min-width: 64px;
  }
  .sov-meet-join {
    background: #1a73e8;
    padding: 0 24px;
  }
  .sov-meet-join:hover {
    background: #2b7fec;
  }
  .sov-meet-message {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    justify-content: center;
    padding: 24px;
    text-align: center;
    color: #d0d3da;
  }
  .sov-meet-notice {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 12px;
    background: #d93025;
    border-radius: 6px;
    font-size: 13px;
  }
  .sov-meet-notice button {
    margin-left: 8px;
    border: none;
    background: none;
    color: #fff;
    cursor: pointer;
  }
  .sov-meet-prejoin {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 32px;
    padding: 24px;
  }
  .sov-meet-preview {
    position: relative;
    width: min(520px, 100%);
    aspect-ratio: 16 / 9;
    background: #2b2e36;
    border-radius: 12px;
    overflow: hidden;
  }
  .sov-meet-preview video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1);
  }
  .sov-meet-preview .sov-meet-controls {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: transparent;
  }
  .sov-meet-side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
    max-width: 320px;
  }
  .sov-meet-side h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
  }
  .sov-meet-side p {
    margin: 0;
    color: #b8bcc6;
  }
  .sov-meet-side input {
    width: 100%;
    padding: 10px 12px;
    font-size: 15px;
    border: 1px solid #4a4f5b;
    border-radius: 6px;
    background: #2b2e36;
    color: #fff;
  }
  @media (max-width: 600px) {
    .sov-meet-grid-side {
      display: none;
    }
    .sov-meet-count {
      display: none;
    }
  }
`;
