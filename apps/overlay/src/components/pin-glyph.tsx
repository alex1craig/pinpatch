import type { ReactElement } from "react";

const PIN_OUTLINE_PATH = "M12 17v5";
const PIN_BODY_PATH =
  "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z";

const PIN_CURSOR_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#000000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='${PIN_OUTLINE_PATH}'/><path d='${PIN_BODY_PATH}' fill='#ffffff'/></svg>`;

export const PIN_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(PIN_CURSOR_SVG)}") 8 8, auto`;

type PinGlyphProps = {
  stroke?: string;
  strokeWidth?: string;
};

export const PinGlyph = ({ stroke = "#000000", strokeWidth = "2" }: PinGlyphProps): ReactElement => {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
    >
      <path d={PIN_OUTLINE_PATH} />
      <path d={PIN_BODY_PATH} fill="#ffffff" />
    </svg>
  );
};
