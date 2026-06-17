import { describe, expect, it } from "vitest";
import { checkFixedWindowRateLimit } from "@/lib/rate-limit";

describe("checkFixedWindowRateLimit", () => {
  it("blocks requests beyond the fixed window limit", () => {
    const key = `test-${Date.now()}-${Math.random()}`;

    expect(checkFixedWindowRateLimit({ key, limit: 2, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(checkFixedWindowRateLimit({ key, limit: 2, windowMs: 1000, now: 200 }).allowed).toBe(true);

    const blocked = checkFixedWindowRateLimit({ key, limit: 2, windowMs: 1000, now: 300 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window expires", () => {
    const key = `test-${Date.now()}-${Math.random()}`;

    expect(checkFixedWindowRateLimit({ key, limit: 1, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(checkFixedWindowRateLimit({ key, limit: 1, windowMs: 1000, now: 200 }).allowed).toBe(false);
    expect(checkFixedWindowRateLimit({ key, limit: 1, windowMs: 1000, now: 1200 }).allowed).toBe(true);
  });
});
