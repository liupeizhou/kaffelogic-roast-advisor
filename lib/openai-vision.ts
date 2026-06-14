import { normalizeAnalysis } from "@/lib/diagnostics";
import { getRuntimeConfig } from "@/lib/runtime-config";
import type { RoastLogAnalysis } from "@/lib/types";

const ANALYSIS_PROMPT = `
You are a Kaffelogic Nano roast log analyst. Analyze the uploaded roast log chart.
Return only JSON matching this shape:
{
  "summary": "one concise Chinese sentence",
  "confidence": 0.0,
  "needsReview": true,
  "legends": ["mean temp", "profile"],
  "keyMetrics": {
    "profileName": null,
    "expectedFirstCrack": {"time": null, "temperatureC": null},
    "firstCrack": {"time": null, "temperatureC": null},
    "roastEnd": {"time": null, "temperatureC": null},
    "developmentTime": null,
    "developmentRatioPercent": null,
    "developmentRiseC": null,
    "inputWeightG": null,
    "outputWeightG": null,
    "weightLossPercent": null,
    "manualEnd": null
  },
  "curveAssessment": ["Chinese bullet"],
  "riskNotes": ["Chinese bullet"],
  "nextRoastSuggestions": ["Chinese bullet"],
  "extractedText": "visible text you used"
}
Be conservative. If a number is not readable, use null and set needsReview=true.
Focus on first crack, roast end, development, ROR crash/flick, profile tracking, power behavior, boost areas, and whether manual end is visible.
`;

export async function analyzeRoastLogImage(dataUrl: string): Promise<RoastLogAnalysis> {
  const config = await getRuntimeConfig();
  const apiKey = config.aiApiKey;
  const model = config.aiVisionModel;
  if (!apiKey) {
    throw new Error("AI_API_KEY is not configured");
  }

  const baseUrl = config.aiBaseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You return strict JSON only. Do not use Markdown fences."
        },
        {
          role: "user",
          content: [
            { type: "text", text: ANALYSIS_PROMPT },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Vision request failed: ${response.status} ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);
  const parsed = parseJsonFromText(outputText);
  const analysis = normalizeAnalysis(parsed);
  return { ...analysis, model };
}

function extractOutputText(payload: unknown): string {
  const root = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
    choices?: Array<{ message?: { content?: string | Array<{ text?: string; type?: string }> } }>;
  };
  if (typeof root.output_text === "string") return root.output_text;
  const choiceContent = root.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string") return choiceContent;
  if (Array.isArray(choiceContent)) return choiceContent.map((item) => item.text).filter(Boolean).join("\n");
  const chunks = root.output?.flatMap((item) => item.content ?? []).map((content) => content.text).filter(Boolean) ?? [];
  return chunks.join("\n");
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Vision response did not contain JSON.");
    return JSON.parse(match[0]);
  }
}
