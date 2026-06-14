import { describe, expect, it } from "vitest";
import { createNeedsReviewAnalysis, normalizeAnalysis } from "@/lib/diagnostics";
import { classifyUpload, hashBuffer } from "@/lib/uploads";

describe("upload helpers", () => {
  it("classifies .kpro and image uploads", () => {
    expect(classifyUpload("KL Natural.kpro", "text/plain", "")).toBe("kpro");
    expect(classifyUpload("log27.png", "image/png", "")).toBe("log_image");
    expect(classifyUpload("._log27.png", "image/png", "")).toBe("unknown");
  });

  it("creates stable SHA-256 hashes for duplicate detection", () => {
    expect(hashBuffer(Buffer.from("same"))).toBe(hashBuffer(Buffer.from("same")));
    expect(hashBuffer(Buffer.from("same"))).not.toBe(hashBuffer(Buffer.from("different")));
  });

  it("normalizes uncertain visual analysis as reviewable", () => {
    const fallback = createNeedsReviewAnalysis("no api key");
    expect(fallback.needsReview).toBe(true);
    expect(fallback.confidence).toBeLessThan(0.5);

    const normalized = normalizeAnalysis({ summary: "ok", confidence: 0.9 });
    expect(normalized.summary).toBe("ok");
    expect(normalized.needsReview).toBe(false);
  });
});
