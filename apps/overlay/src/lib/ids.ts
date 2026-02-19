export const randomId = (): string => {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const toTaskId = (): string => {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${date}-${suffix}`;
};

export const getRouteKey = (): string => {
  return `${window.location.pathname}${window.location.search}`;
};
