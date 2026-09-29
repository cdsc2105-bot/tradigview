import type { ReactNode } from "react";
import type { ToolId } from "./tools";

/*
 * Tool icons on a 28×28 grid, 1px strokes. Classes:
 *   node  — anchor dot (filled with the panel colour so it reads as a ring)
 *   tint  — faint fill · solid — solid fill · dash — dashed · dim — secondary
 */
const Node = ({ x, y, r = 2 }: { x: number; y: number; r?: number }) => (
  <circle className="node" cx={x} cy={y} r={r} />
);

export const TOOL_ICONS: Record<ToolId, ReactNode> = {
  trend: (
    <>
      <path d="M6 22 22 6" />
      <Node x={6} y={22} />
      <Node x={22} y={6} />
    </>
  ),
  ray: (
    <>
      <path d="M6 22 25 3" />
      <Node x={6} y={22} />
      <Node x={14} y={14} />
    </>
  ),
  extended: (
    <>
      <path d="M3 25 25 3" />
      <Node x={10} y={18} />
      <Node x={18} y={10} />
    </>
  ),
  info: (
    <>
      <path d="M5 20 17 8" />
      <Node x={5} y={20} />
      <Node x={17} y={8} />
      <rect className="tint" x="14" y="15" width="10" height="8" rx="1.5" />
      <rect x="14" y="15" width="10" height="8" rx="1.5" />
      <path className="dim" d="M16.5 18h5M16.5 20.5h3.5" />
    </>
  ),
  trendangle: (
    <>
      <path d="M5 21 22 7" />
      <path className="dash dim" d="M5 21h19" />
      <path d="M13 21a8 8 0 0 0-1.6-4.8" />
      <Node x={5} y={21} />
      <Node x={22} y={7} />
    </>
  ),
  hline: (
    <>
      <path d="M3 14h22" />
      <Node x={14} y={14} />
    </>
  ),
  hray: (
    <>
      <path d="M8 14h17" />
      <path className="dim" d="m22 11.5 2.5 2.5-2.5 2.5" />
      <Node x={7} y={14} />
    </>
  ),
  vline: (
    <>
      <path d="M14 3v22" />
      <Node x={14} y={14} />
    </>
  ),
  crossline: (
    <>
      <path d="M14 3v22M3 14h22" />
      <Node x={14} y={14} />
    </>
  ),
  arrow: (
    <>
      <path d="M6 22 18.5 9.5" />
      <path className="solid" d="m23 5-2.4 8-5.6-5.6z" />
      <Node x={6} y={22} />
    </>
  ),
  channel: (
    <>
      <path className="tint" d="M4 17 17 6l7 5-13 11z" />
      <path d="M4 17 17 6M11 22l13-11" />
      <path className="dash dim" d="m7.5 19.5 13-11" />
      <Node x={4} y={17} />
      <Node x={17} y={6} />
      <Node x={24} y={11} />
    </>
  ),
  regression: (
    <>
      <path className="tint" d="m4 10 20-6v12L4 22z" />
      <path className="dim" d="m4 10 20-6M4 22l20-6" />
      <path className="dash" d="m4 16 20-6" />
      <circle className="solid" cx="7.5" cy="17" r="1" />
      <circle className="solid" cx="11" cy="14" r="1" />
      <circle className="solid" cx="14.5" cy="16" r="1" />
      <circle className="solid" cx="18" cy="12.5" r="1" />
      <circle className="solid" cx="21" cy="13" r="1" />
    </>
  ),
  pitchfork: (
    <>
      <path className="tint" d="M12 7h13v14H12z" />
      <path d="M4 14h21M12 7h13M12 21h13" />
      <path className="dash dim" d="M12 7v14" />
      <Node x={4} y={14} />
      <Node x={12} y={7} />
      <Node x={12} y={21} />
    </>
  ),
  fib: (
    <>
      <path d="M8 4h17M8 24h17" />
      <path className="dim" d="M8 9h17M8 12.5h17M8 16h17M8 19.5h17" />
      <path className="dash" d="M8 24 25 4" />
      <Node x={8} y={24} />
      <Node x={25} y={4} />
    </>
  ),
  fibext: (
    <>
      <path d="m3 22 6-13 4 7" />
      <path d="M16 5h9M16 16h9" />
      <path className="dim" d="M16 9h9M16 12.5h9" />
      <Node x={3} y={22} r={1.8} />
      <Node x={9} y={9} r={1.8} />
      <Node x={13} y={16} r={1.8} />
    </>
  ),
  fibtime: (
    <>
      <path d="M3.5 4v20M6 4v20" />
      <path className="dim" d="M9 4v20M13 4v20M19 4v20" />
      <path className="dash" d="M25.5 4v20" />
    </>
  ),
  gannbox: (
    <>
      <rect className="tint" x="4" y="4" width="20" height="20" />
      <rect x="4" y="4" width="20" height="20" />
      <path className="dim" d="M9 4v20M14 4v20M19 4v20M4 9h20M4 14h20M4 19h20" />
      <path className="dash" d="M4 24 24 4" />
    </>
  ),
  xabcd: (
    <>
      <path className="tint" d="m3 20 5-14 4 9zm9-5 6-7 7 13z" />
      <path d="m3 20 5-14 4 9 6-7 7 13" />
      <Node x={3} y={20} r={1.6} />
      <Node x={8} y={6} r={1.6} />
      <Node x={12} y={15} r={1.6} />
      <Node x={18} y={8} r={1.6} />
      <Node x={25} y={21} r={1.6} />
    </>
  ),
  abcd: (
    <>
      <path d="m4 21 6-14 6 8 8-10" />
      <path className="dash dim" d="m4 21 12-6M10 7l14-2" />
      <Node x={4} y={21} r={1.6} />
      <Node x={10} y={7} r={1.6} />
      <Node x={16} y={15} r={1.6} />
      <Node x={24} y={5} r={1.6} />
    </>
  ),
  hs: (
    <>
      <path d="m2 22 4-9 3.5 4L14 5l4.5 12 3.5-4 4 9" />
      <path className="dash" d="M3 17h22" />
      <Node x={6} y={13} r={1.5} />
      <Node x={14} y={5} r={1.5} />
      <Node x={22} y={13} r={1.5} />
    </>
  ),
  elliott: (
    <>
      <path d="m3 23 4.5-9 3 4L17 6l3 5 5-7" />
      <Node x={7.5} y={14} r={1.5} />
      <Node x={10.5} y={18} r={1.5} />
      <Node x={17} y={6} r={1.5} />
      <Node x={20} y={11} r={1.5} />
      <Node x={25} y={4} r={1.5} />
    </>
  ),
  elliottabc: (
    <>
      <path d="m4 5 7 14 5-7 8 11" />
      <Node x={4} y={5} r={1.6} />
      <Node x={11} y={19} r={1.6} />
      <Node x={16} y={12} r={1.6} />
      <Node x={24} y={23} r={1.6} />
    </>
  ),
  long: (
    <>
      <rect className="tint" x="5" y="4" width="18" height="10" />
      <rect x="5" y="4" width="18" height="10" />
      <rect className="dim" x="5" y="14" width="18" height="7" />
      <path d="m11 11 3-3 3 3M14 8v4M3 14h22" />
    </>
  ),
  short: (
    <>
      <rect className="dim" x="5" y="7" width="18" height="7" />
      <rect className="tint" x="5" y="14" width="18" height="10" />
      <rect x="5" y="14" width="18" height="10" />
      <path d="m11 17 3 3 3-3M14 16v4M3 14h22" />
    </>
  ),
  range: (
    <>
      <rect className="tint" x="4" y="4" width="20" height="20" />
      <rect className="dash" x="4" y="4" width="20" height="20" />
      <path d="M14 8v12M8 14h12" />
      <path d="M11.5 10.5 14 8l2.5 2.5M17.5 11.5 20 14l-2.5 2.5" />
    </>
  ),
  daterange: (
    <>
      <path className="tint" d="M4 5h20v18H4z" />
      <path d="M4 5v18M24 5v18M7 14h14" />
      <path d="m18 11 3 3-3 3" />
    </>
  ),
  pricerange: (
    <>
      <path className="tint" d="M5 4h18v20H5z" />
      <path d="M5 4h18M5 24h18M14 7v14" />
      <path d="m11 18 3 3 3-3" />
    </>
  ),
  avwap: (
    <>
      <path className="dim" d="M9 13v6M13 10v5M17 11v7M21 7v5" />
      <path d="M6 21c4-.5 5.5-7 9.5-6.8S21 11 24.5 7" />
      <path className="solid" d="m6 17 2.5 4h-5z" />
    </>
  ),
  frvp: (
    <>
      <rect className="tint" x="5" y="5" width="18" height="18" rx="1.5" />
      <path className="dim" d="M8 20V8M8 8h10M8 12h7M8 16h9" />
      <path d="M20 5v18" />
    </>
  ),
  brush: (
    <>
      <path d="M4 19c2.5-5 7-8.5 11.5-6.5S21 20 17.5 24" />
      <path className="dim" d="m6 21 2.5 2.5" />
    </>
  ),
  rect: (
    <>
      <rect className="tint" x="5" y="8" width="18" height="12" />
      <rect x="5" y="8" width="18" height="12" />
      <Node x={5} y={20} />
      <Node x={23} y={8} />
    </>
  ),
  circle: (
    <>
      <circle className="tint" cx="14" cy="14" r="9.5" />
      <circle cx="14" cy="14" r="9.5" />
      <path className="dash dim" d="M14 14h9.5" />
      <Node x={14} y={14} r={1.6} />
    </>
  ),
  text: <path d="M7 9V6h14v3M14 6v16M11 22h6" />,
  pricelabel: (
    <>
      <path className="tint" d="M4 9h14l6 5-6 5H4z" />
      <path d="M4 9h14l6 5-6 5H4z" />
      <path className="dim" d="M7.5 14h7" />
    </>
  ),
  flag: (
    <>
      <path d="M8 4v20M5.5 24h5" />
      <path className="tint" d="M8 5h13l-3 4 3 4H8z" />
      <path d="M8 5h13l-3 4 3 4H8" />
    </>
  ),
  arrowup: (
    <>
      <path className="tint" d="m14 4 8.5 9H18v10.5h-8V13H5.5z" />
      <path d="m14 4 8.5 9H18v10.5h-8V13H5.5z" />
    </>
  ),
  arrowdown: (
    <>
      <path className="tint" d="m14 24 8.5-9H18V4.5h-8V15H5.5z" />
      <path d="m14 24 8.5-9H18V4.5h-8V15H5.5z" />
    </>
  ),
};

export const ACTION_ICONS = {
  magnet: (
    <>
      <path d="M8.5 5v8.5a5.5 5.5 0 0 0 11 0V5H16v8.5a2 2 0 0 1-4 0V5z" />
      <path className="solid" d="M8.5 5H12v3H8.5zM16 5h3.5v3H16z" />
    </>
  ),
  keep: (
    <>
      <path d="M9.5 8.5a5.5 5.5 0 0 1 9.5 3.5" />
      <path d="m18 10 1.2 2.4 2.4-1" />
      <path d="M18.5 19.5a5.5 5.5 0 0 1-9.5-3.5" />
      <path d="M10 18 8.8 15.6l-2.4 1" />
      <path className="solid" d="M13 13h2v2h-2z" />
    </>
  ),
  undo: <path d="m9.5 8.5-4 4 4 4M5.5 12.5H17a5 5 0 0 1 0 10h-4" />,
  redo: <path d="m18.5 8.5 4 4-4 4M22.5 12.5H11a5 5 0 0 0 0 10h4" />,
  lock: (
    <>
      <rect x="7.5" y="12.5" width="13" height="10" rx="2" />
      <path d="M10.5 12.5v-3a3.5 3.5 0 0 1 7 0v3" />
      <circle className="solid" cx="14" cy="17.5" r="1.3" />
    </>
  ),
  unlock: (
    <>
      <rect x="7.5" y="12.5" width="13" height="10" rx="2" />
      <path d="M10.5 12.5v-3a3.5 3.5 0 0 1 6.8-1.2" />
      <circle className="solid" cx="14" cy="17.5" r="1.3" />
    </>
  ),
  eye: (
    <>
      <path d="M3.5 14c3-5.5 18-5.5 21 0-3 5.5-18 5.5-21 0z" />
      <circle cx="14" cy="14" r="3.5" />
      <circle className="solid" cx="14" cy="14" r="1.3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3.5 14c3-5.5 18-5.5 21 0-3 5.5-18 5.5-21 0z" />
      <circle cx="14" cy="14" r="3.5" />
      <path d="M5 23 23 5" />
    </>
  ),
  trash: (
    <>
      <path d="M5.5 8.5h17M11.5 8.5V6h5v2.5M7.5 8.5l1 14h11l1-14" />
      <path className="dim" d="M11.5 12v7M14 12v7M16.5 12v7" />
    </>
  ),
  clone: (
    <>
      <rect x="9.5" y="9.5" width="13" height="13" rx="2" />
      <path className="dim" d="M5.5 18.5v-11a2 2 0 0 1 2-2h11" />
    </>
  ),
  text: <path d="M7 9V6h14v3M14 6v16M11 22h6" />,
  chevron: <path d="m11 8.5 5.5 5.5-5.5 5.5" />,
  ruler: (
    <>
      <path d="M4 18.5 18.5 4 24 9.5 9.5 24z" />
      <path className="dim" d="m8 14.5 2 2M10.5 12l3 3M13 9.5l2 2M15.5 7l3 3" />
    </>
  ),
  cursor: <path d="M8 5v16l4.5-4.5 3 6.5 2.5-1-3-6.5H21z" />,
};

/** An icon on the 28-grid; styling of the classes lives in globals.css (.draw-ico). */
export function DrawIcon({ children, size = 28 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="draw-ico"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}
