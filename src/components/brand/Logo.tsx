/**
 * The "Trading" mark: three rising candles on a rounded tile. Kept as inline
 * SVG so it stays crisp at any size and matches `app/icon.svg`.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#2962ff" />
      <path d="M9 10v14M16 7v17M23 5v14" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="6.5" y="14" width="5" height="7" rx="1" fill="#fff" />
      <rect x="13.5" y="10" width="5" height="9" rx="1" fill="#fff" />
      <rect x="20.5" y="8" width="5" height="8" rx="1" fill="#26d9a0" />
    </svg>
  );
}

export const BRAND_NAME = "Trading";
