import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { getMealLogsInRange, createMealLog } from "@/lib/mealLog";
import { estimateMealNutrition, estimateMealNutritionFromText } from "@/lib/anthropic";
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
    const text = String(form.get("text") ?? "").trim();
    const date = String(form.get("date") ?? "");
    if (!(file instanceof File) && !text) throw new ApiError(400, "画像または文章を指定してください");
    if (file instanceof File && file.size > MAX_BYTES) throw new ApiError(400, "画像サイズが大きすぎます");
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");

    let estimate;
    try {
      if (file instanceof File) {
        const buf = Buffer.from(await file.arrayBuffer());
        estimate = await estimateMealNutrition(buf.toString("base64"), file.type || "image/jpeg");
      } else {
        estimate = await estimateMealNutritionFromText(text);
      }
    } catch (err) {
      throw new ApiError(502, `解析に失敗しました。時間をおいてもう一度お試しください。（詳細: ${err instanceof Error ? err.message : String(err)}）`);
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
