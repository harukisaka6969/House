import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { getRecordCategories, getRecordsForCategory, createRecord } from "@/lib/personalRecords";
import { extractRecordFromPhoto, extractRecordFromText } from "@/lib/anthropic";
import { todayStrJST, isValidDateStr } from "@/lib/date";
import { recomputePfcTargetFromBodyRecords } from "@/lib/pfcRecommendation";

const MAX_BYTES = 10 * 1024 * 1024;

export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    if (category) {
      const rows = await getRecordsForCategory(session.profile_id, category);
      const records = rows.map((r) => ({ id: r.id, category: r.category, date: r.date, title: r.title, metrics: r.metrics, memo: r.memo, created_at: r.created_at }));
      return NextResponse.json({ records });
    }

    const categories = await getRecordCategories(session.profile_id);
    return NextResponse.json({ categories });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const limited = rateLimit(`ai:${session.profile_id}`, 60, 60 * 60 * 1000);
    if (!limited.ok) throw new ApiError(429, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");

    const form = await req.formData();
    const file = form.get("image");
    const text = String(form.get("text") ?? "").trim();
    if (!(file instanceof File) && !text) throw new ApiError(400, "画像または文章を指定してください");
    if (file instanceof File && file.size > MAX_BYTES) throw new ApiError(400, "画像サイズが大きすぎます");

    const existingCategories = (await getRecordCategories(session.profile_id)).map((c) => c.category);

    let extracted;
    try {
      if (file instanceof File) {
        const buf = Buffer.from(await file.arrayBuffer());
        extracted = await extractRecordFromPhoto(buf.toString("base64"), file.type || "image/jpeg", existingCategories);
      } else {
        extracted = await extractRecordFromText(text, existingCategories, todayStrJST());
      }
    } catch (err) {
      throw new ApiError(502, `解析に失敗しました。時間をおいてもう一度お試しください。（詳細: ${err instanceof Error ? err.message : String(err)}）`);
    }

    const date = extracted.date && isValidDateStr(extracted.date) ? extracted.date : todayStrJST();
    const record = await createRecord(session.profile_id, {
      category: extracted.category,
      date,
      title: extracted.title,
      metrics: extracted.metrics,
    });

    // 体重を含む記録（体組成の記録）なら、そのたびに減量しつつ筋肉量を落とさない方向で
    // 食事のPFC目標を自動で見直す（筋トレの挙上量トレンド・実際の食事ログとも突き合わせる）。
    let pfcUpdate = null;
    if (record.metrics.some((m) => m.label === "体重")) {
      try {
        pfcUpdate = await recomputePfcTargetFromBodyRecords(session.profile_id);
      } catch (e) {
        console.error("pfc target recompute failed", e);
      }
    }

    return NextResponse.json({
      record: { id: record.id, category: record.category, date: record.date, title: record.title, metrics: record.metrics, memo: record.memo, created_at: record.created_at },
      pfcUpdate,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
