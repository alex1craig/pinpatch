import type { PinStatus } from "../components/types";

export const isPinStatus = (status: unknown): status is PinStatus => {
  return (
    status === "idle" ||
    status === "queued" ||
    status === "running" ||
    status === "completed" ||
    status === "error" ||
    status === "cancelled" ||
    status === "timeout"
  );
};
