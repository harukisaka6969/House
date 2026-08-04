import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { getRecordCategories, getRecordsForCategory, createRecord } from "@/lib/personalRecords";
import { extractRecordFromPhoto } from "@/lib/anthropic";
import { todayStrJST, isValidDateStr } from "@/lib/date";

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
    if (!(file instanceof File)) throw new ApiError(400, "画像が指定されていません");
    if (file.size > MAX_BYTES) throw new ApiError(400, "画像サイズが大きすぎます");

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");

    const existingCategories = (await getRecordCategories(session.profile_id)).map((c) => c.category);

    let extracted;
    try {
      extracted = await extractRecordFromPhoto(base64, file.type || "image/jpeg", existingCategories);
    } catch (err) {
      throw new ApiError(502, `画像の解析に失敗しました。時間をおいてもう一度お試しください。（詳細: ${err instanceof Error ? err.message : String(err)}）`);
    }

    const date = extracted.date && isValidDateStr(extracted.date) ? extracted.date : todayStrJST();
    const record = await createRecord(session.profile_id, {
      category: extracted.category,
      date,
      title: extracted.title,
      metrics: extracted.metrics,
    });

    return NextResponse.json({ record: { id: record.id, category: record.category, date: record.date, title: record.title, metrics: record.metrics, memo: record.memo, created_at: record.created_at } });
  } catch (e) {
    return errorResponse(e);
  }
}
