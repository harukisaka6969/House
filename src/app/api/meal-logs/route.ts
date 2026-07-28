import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { getMealLogsInRange, createMealLog } from "@/lib/mealLog";
import { estimateMealNutrition } from "@/lib/anthropic";
import { isValidMonthKey, nowMonthKeyJST, isValidDateStr } from "@/lib/date";
import { monthRange } from "@/lib/expenses";

const MAX_BYTES = 10 * 1024 * 1024;

export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const m = searchParams.get("month") ?? nowMonthKeyJST();
    if (!isValidMonthKey(m)) throw new ApiError(400, "invalid month");
    const { from, toExclusive } = monthRange(m);
    const logs = await getMealLogsInRange(session.profile_id, from, toExclusive);
    return NextResponse.json({ logs });
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
    const date = String(form.get("date") ?? "");
    if (!(file instanceof File)) throw new ApiError(400, "画像が指定されていません");
    if (file.size > MAX_BYTES) throw new ApiError(400, "画像サイズが大きすぎます");
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");
    let estimate;
    try {
      estimate = await estimateMealNutrition(base64, file.type || "image/jpeg");
    } catch (err) {
      throw new ApiError(502, `画像の解析に失敗しました。時間をおいてもう一度お試しください。（詳細: ${err instanceof Error ? err.message : String(err)}）`);
    }

    const log = await createMealLog(session.profile_id, {
      date,
      description: estimate.description || "",
      calories: Number(estimate.calories) || 0,
      protein_g: Number(estimate.protein_g) || 0,
      fat_g: Number(estimate.fat_g) || 0,
      carb_g: Number(estimate.carb_g) || 0,
    });
    return NextResponse.json({ log });
  } catch (e) {
    return errorResponse(e);
  }
}
