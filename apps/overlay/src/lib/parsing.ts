export const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
};

export const asFiniteNumber = (value: unknown, fallback: number): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

export const sanitizeTextHint = (value: string | null): string | undefined => {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 200);
};
