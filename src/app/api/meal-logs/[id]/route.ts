import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { updateMealLog, deleteMealLog } from "@/lib/mealLog";
import { estimateMealNutritionFromText } from "@/lib/anthropic";

const patchSchema = z.object({
  description: z.string().max(80).optional(),
  calories: z.number().min(0).max(20000).optional(),
  protein_g: z.number().min(0).max(2000).optional(),
  fat_g: z.number().min(0).max(2000).optional(),
  carb_g: z.number().min(0).max(4000).optional(),
  // trueなら、descriptionの文章からAIで栄養価を再計算してcalories等を上書きする（手入力の数値は無視）。
  regenerate: z.boolean().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const { regenerate, ...patch } = patchSchema.parse(await req.json());

    if (regenerate) {
      if (!patch.description?.trim()) throw new ApiError(400, "タイトルを入力してください");
      const limited = rateLimit(`ai:${session.profile_id}`, 60, 60 * 60 * 1000);
      if (!limited.ok) throw new ApiError(429, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");
      let estimate;
      try {
        estimate = await estimateMealNutritionFromText(patch.description);
      } catch (err) {
        throw new ApiError(502, `解析に失敗しました。時間をおいてもう一度お試しください。（詳細: ${err instanceof Error ? err.message : String(err)}）`);
      }
      const log = await updateMealLog(id, session.profile_id, {
        description: patch.description,
        calories: Number(estimate.calories) || 0,
        protein_g: Number(estimate.protein_g) || 0,
        fat_g: Number(estimate.fat_g) || 0,
        carb_g: Number(estimate.carb_g) || 0,
      });
      return NextResponse.json({ log });
    }

    const log = await updateMealLog(id, session.profile_id, patch);
    return NextResponse.json({ log });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteMealLog(id, session.profile_id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
