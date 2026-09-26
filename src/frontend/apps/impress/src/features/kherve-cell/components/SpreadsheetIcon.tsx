/** A small green grid: KherveCELL spreadsheets, next to KherveDOC documents. */
export const SpreadsheetIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" fill="#1f7a4d" />
    <path
      d="M3 9h18M3 15h18M9 3v18M15 3v18"
      stroke="#fff"
      strokeOpacity="0.7"
      strokeWidth="1.4"
    />
  </svg>
);
