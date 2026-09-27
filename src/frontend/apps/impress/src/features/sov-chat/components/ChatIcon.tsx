/** A purple speech bubble: SOV Chat conversations. */
export const ChatIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" fill="#7b4fd6" />
    <path
      d="M7 7.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5.5L8 18v-2.5H7A1.5 1.5 0 0 1 5.5 14V9A1.5 1.5 0 0 1 7 7.5z"
      fill="#fff"
    />
  </svg>
);
