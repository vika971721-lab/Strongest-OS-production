export const now = (): number => Date.now();

export const isOlderThan = (startedAt: number, ttlMs: number, nowMs = Date.now()): boolean =>
  nowMs - startedAt > ttlMs;
