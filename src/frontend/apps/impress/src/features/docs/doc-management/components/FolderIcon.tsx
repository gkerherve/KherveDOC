/** A yellow folder: a document that only holds other documents. */
export const FolderIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M2.5 6.5A2 2 0 0 1 4.5 4.5h4.6l2 2.2h8.4a2 2 0 0 1 2 2v9.8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z"
      fill="#e0a526"
    />
    <path d="M2.5 9.2h19v9.3a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z" fill="#f5c04a" />
  </svg>
);
