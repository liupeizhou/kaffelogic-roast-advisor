import type { CurveDocumentRecord } from "@/lib/roast-persistence";

export type ShareCopy = {
  title: string;
  summary: string;
  aiPrediction: string;
  quoteText: string;
  quoteAuthor: string;
  quoteWork: string;
  quoteSourceNote: string;
};

const QUOTES = [
  {
    text: "No great thing is created suddenly.",
    author: "Epictetus",
    work: "Discourses",
    sourceNote: "Commonly attributed to Epictetus, Discourses."
  },
  {
    text: "The beginning is more than half of the whole.",
    author: "Aristotle",
    work: "Politics",
    sourceNote: "Paraphrase of Aristotle's emphasis on beginnings."
  },
  {
    text: "Measure what is measurable, and make measurable what is not so.",
    author: "Galileo Galilei",
    work: "Attributed",
    sourceNote: "Widely attributed; keep as a sourced attribution note, not a verbatim scholarly citation."
  }
];

export async function generateShareCopy(curve: CurveDocumentRecord): Promise<ShareCopy> {
  const deterministic = buildDeterministicCopy(curve);
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || "https://api.siliconflow.cn/v1";
  const model = process.env.AI_TEXT_MODEL || process.env.AI_VISION_MODEL;
  if (!apiKey || !model) return deterministic;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Generate concise JSON for a Kaffelogic roast profile share card. Do not invent numeric curve data. Use the provided quote exactly if present."
          },
          {
            role: "user",
            content: JSON.stringify({
              curve: {
                title: curve.title,
                description: curve.description,
                recommendedLevel: curve.recommended_level,
                expectedFirstCrackTemp: curve.expected_first_crack_temp,
                endTemp: curve.roast_curve_points.at(-1)?.value ?? null,
                tempPoints: curve.roast_curve_points.length,
                fanPoints: curve.fan_curve_points.length
              },
              quote: {
                text: deterministic.quoteText,
                author: deterministic.quoteAuthor,
                work: deterministic.quoteWork,
                sourceNote: deterministic.quoteSourceNote
              },
              requiredJsonKeys: ["title", "summary", "aiPrediction"]
            })
          }
        ],
        temperature: 0.4,
        response_format: { type: "json_object" }
      })
    });
    if (!response.ok) return deterministic;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as Partial<ShareCopy>;
    return {
      ...deterministic,
      title: parsed.title || deterministic.title,
      summary: parsed.summary || deterministic.summary,
      aiPrediction: parsed.aiPrediction || deterministic.aiPrediction
    };
  } catch {
    return deterministic;
  }
}

function buildDeterministicCopy(curve: CurveDocumentRecord): ShareCopy {
  const quote = QUOTES[Math.abs(hashText(curve.id)) % QUOTES.length];
  const endTemp = curve.roast_curve_points.at(-1)?.value;
  return {
    title: curve.title,
    summary: `${curve.title} keeps ${curve.roast_curve_points.length} temperature points and ${curve.fan_curve_points.length} fan points in balance.`,
    aiPrediction: `The curve trends toward ${endTemp ? `${Math.round(endTemp)} C` : "a controlled finish"} with expected first crack near ${curve.expected_first_crack_temp ?? "the marked FC point"}. Watch the development phase and avoid a late ROR flick.`,
    quoteText: quote.text,
    quoteAuthor: quote.author,
    quoteWork: quote.work,
    quoteSourceNote: quote.sourceNote
  };
}

function hashText(value: string) {
  let hash = 0;
  for (const char of value) hash = Math.imul(31, hash) + char.charCodeAt(0) | 0;
  return hash;
}
