/** A yellow notepad with a pencil: SOV Notes. */
export const NotesIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" fill="#e8b224" />
    <path
      d="M7 8h7M7 11.5h5M7 15h3"
      stroke="#fff"
      strokeOpacity="0.92"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M13.2 17.6l.5-2.3 4.1-4.1a1.2 1.2 0 0 1 1.7 1.7l-4.1 4.1z"
      fill="#fff"
    />
  </svg>
);
