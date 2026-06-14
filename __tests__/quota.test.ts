import { describe, expect, it } from "vitest";
import { getShanghaiUsageWindow, PLAN_LIMITS } from "@/lib/quota";

describe("quota helpers", () => {
  it("uses Asia/Shanghai day and month boundaries", () => {
    const beforeShanghaiMidnight = getShanghaiUsageWindow(new Date("2026-06-14T15:59:00.000Z"));
    const afterShanghaiMidnight = getShanghaiUsageWindow(new Date("2026-06-14T16:01:00.000Z"));

    expect(beforeShanghaiMidnight.usageDay).toBe("2026-06-14");
    expect(afterShanghaiMidnight.usageDay).toBe("2026-06-15");
    expect(afterShanghaiMidnight.usageMonth).toBe("2026-06");
  });

  it("captures selected commercial plan limits", () => {
    expect(PLAN_LIMITS.free.dailyLimit).toBe(3);
    expect(PLAN_LIMITS.balanced).toMatchObject({ dailyLimit: 10, monthlyLimit: 300, priceCny: 39.9 });
    expect(PLAN_LIMITS.pro).toMatchObject({ dailyLimit: 100, monthlyLimit: 3000, priceCny: 199 });
  });
});
