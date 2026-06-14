import { NextResponse } from "next/server";
import { requireUserResponse } from "@/lib/auth";
import { getCurveDocument, createSharePage } from "@/lib/roast-persistence";
import { generateShareCopy } from "@/lib/share-copy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, denied } = await requireUserResponse();
  if (denied) return denied;
  try {
    const body = await request.json();
    const curveDocumentId = typeof body.curveDocumentId === "string" ? body.curveDocumentId : "";
    const template = body.template === "baroque" || body.template === "cyberpunk" ? body.template : "barista";
    if (!curveDocumentId) return NextResponse.json({ error: "缺少 curveDocumentId。" }, { status: 400 });
    const curve = await getCurveDocument(curveDocumentId, user.id);
    if (!curve) return NextResponse.json({ error: "曲线不存在。" }, { status: 404 });
    const copy = await generateShareCopy(curve);
    const share = await createSharePage({
      ownerId: user.id,
      curveDocumentId,
      template,
      title: copy.title,
      summary: copy.summary,
      aiPrediction: copy.aiPrediction,
      quoteText: copy.quoteText,
      quoteAuthor: copy.quoteAuthor,
      quoteWork: copy.quoteWork,
      quoteSourceNote: copy.quoteSourceNote
    });
    return NextResponse.json(share);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成分享页失败。" }, { status: 500 });
  }
}
