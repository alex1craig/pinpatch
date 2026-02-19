import crypto from "node:crypto";

export const nowIso = (): string => new Date().toISOString();

export const generateSessionId = (): string => crypto.randomUUID();

export const generateTaskId = (): string => {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${date}-${suffix}`;
};
