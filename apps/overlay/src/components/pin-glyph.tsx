import type { ReactElement } from "react";

const PIN_PATH =
  "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0";

const PIN_CURSOR_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#000000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='${PIN_PATH}' fill='#ffffff'/><circle cx='12' cy='10' r='3' fill='#ffffff'/></svg>`;

export const PIN_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(PIN_CURSOR_SVG)}") 8 8, auto`;

type PinGlyphProps = {
  stroke?: string;
  fill?: string;
  centerFill?: string;
};

export const PinGlyph = ({ stroke = "#000000", fill = "none", centerFill = "none" }: PinGlyphProps): ReactElement => {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d={PIN_PATH} fill={fill} />
      <circle cx="12" cy="10" r="3" fill={centerFill} />
    </svg>
  );
};
