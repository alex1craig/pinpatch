import type { ReactElement } from "react";
import { AlertCircle, Check } from "lucide-react";
import { Spinner } from "@pinpatch/ui/components/spinner";
import { PinGlyph } from "./pin-glyph";
import type { PinStatus } from "./types";

const STATUS_CLASS: Record<PinStatus, string> = {
  idle: "bg-zinc-900 text-white",
  queued: "bg-blue-600 text-white",
  running: "bg-blue-600 text-white",
  completed: "bg-emerald-600 text-white",
  error: "bg-red-600 text-white",
  cancelled: "bg-red-600 text-white",
  timeout: "bg-red-600 text-white"
};

export const getPinClass = (status: PinStatus): string => {
  return STATUS_CLASS[status];
};

export const PinStatusIcon = ({ status }: { status: PinStatus }): ReactElement => {
  if (status === "queued" || status === "running") {
    return <Spinner className="size-4" />;
  }

  if (status === "completed") {
    return <Check className="size-4" />;
  }

  if (status === "error" || status === "cancelled" || status === "timeout") {
    return <AlertCircle className="size-4" />;
  }

  return <PinGlyph stroke="#ffffff" fill="none" centerFill="none" />;
};
