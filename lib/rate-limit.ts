type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitEntry>();
const MAX_BUCKETS = 10_000;
const SWEEP_INTERVAL_MS = 60_000;

let nextSweepAt = 0;

export function checkFixedWindowRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  const now = input.now ?? Date.now();
  maybeSweepBuckets(now);
  const existing = buckets.get(input.key);
  const current = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + input.windowMs };

  if (current.count >= input.limit) {
    buckets.set(input.key, current);
    return {
      allowed: false,
      limit: input.limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }

  current.count += 1;
  buckets.set(input.key, current);
  return {
    allowed: true,
    limit: input.limit,
    remaining: Math.max(input.limit - current.count, 0),
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  };
}

function maybeSweepBuckets(now: number) {
  if (now < nextSweepAt && buckets.size <= MAX_BUCKETS) return;
  nextSweepAt = now + SWEEP_INTERVAL_MS;

  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }

  while (buckets.size > MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
}
