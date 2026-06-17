import { describe, expect, it } from "vitest";
import { createNeedsReviewAnalysis, normalizeAnalysis } from "@/lib/diagnostics";
import { classifyUpload, hashBuffer, inspectUploadContent } from "@/lib/uploads";

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

  it("detects image uploads from magic bytes instead of trusting client MIME", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const fake = Buffer.from("not really an image");

    expect(inspectUploadContent("log.png", "application/octet-stream", png)).toMatchObject({
      fileKind: "log_image",
      mimeType: "image/png"
    });
    expect(inspectUploadContent("log.png", "image/png", fake).fileKind).toBe("unknown");
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
