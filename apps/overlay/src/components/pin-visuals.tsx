import type { ReactElement } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { PinGlyph } from "./pin-glyph";
import type { PinStatus } from "./types";

export const getPinClass = (status: PinStatus): string => {
  if (status === "completed") {
    return "bg-emerald-600 text-white";
  }

  if (status === "error" || status === "cancelled" || status === "timeout") {
    return "bg-red-600 text-white";
  }

  if (status === "queued" || status === "running") {
    return "bg-blue-600 text-white";
  }

  return "bg-slate-900 text-white";
};

export const PinStatusIcon = ({ status }: { status: PinStatus }): ReactElement => {
  if (status === "queued" || status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin" />;
  }

  if (status === "completed") {
    return <Check className="h-4 w-4" />;
  }

  if (status === "error" || status === "cancelled" || status === "timeout") {
    return <AlertCircle className="h-4 w-4" />;
  }

  return <PinGlyph stroke="#ffffff" strokeWidth="1" />;
};
