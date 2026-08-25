import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { getMealPreps, createMealPrep } from "@/lib/mealPreps";
import { estimateMealPrepNutrition, estimateMealPrepNutritionFromPhoto } from "@/lib/anthropic";

const MAX_BYTES = 10 * 1024 * 1024;

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const preps = await getMealPreps(session.profile_id);
    return NextResponse.json({ preps });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 作り置きを新規登録する。栄養価は、①calories等を直接指定した手入力、または②text/imageからのAI推定の
 * どちらかで確定する（①が指定されていれば②は行わない）。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const form = await req.formData();
    const file = form.get("image");
    const text = String(form.get("text") ?? "").trim();
    const nameInput = String(form.get("name") ?? "").trim();
    const totalWeightG = Number(form.get("total_weight_g"));
    if (!Number.isFinite(totalWeightG) || totalWeightG <= 0) throw new ApiError(400, "総重量(g)を指定してください");

    const manualCaloriesRaw = form.get("calories");
    const manual = manualCaloriesRaw !== null && String(manualCaloriesRaw).trim() !== "";

    let name = nameInput;
    let calories: number;
    let protein_g: number;
    let fat_g: number;
    let carb_g: number;

    if (manual) {
      if (!name) throw new ApiError(400, "名前を入力してください");
      calories = Number(form.get("calories")) || 0;
      protein_g = Number(form.get("protein_g")) || 0;
      fat_g = Number(form.get("fat_g")) || 0;
      carb_g = Number(form.get("carb_g")) || 0;
    } else {
      const limited = rateLimit(`ai:${session.profile_id}`, 60, 60 * 60 * 1000);
      if (!limited.ok) throw new ApiError(429, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");
      if (!(file instanceof File) && !text) throw new ApiError(400, "画像・文章、または手入力の栄養価のいずれかを指定してください");
      if (file instanceof File && file.size > MAX_BYTES) throw new ApiError(400, "画像サイズが大きすぎます");

      let estimate;
      try {
        if (file instanceof File) {
          const buf = Buffer.from(await file.arrayBuffer());
          estimate = await estimateMealPrepNutritionFromPhoto(buf.toString("base64"), file.type || "image/jpeg", totalWeightG);
        } else {
          estimate = await estimateMealPrepNutrition(text, totalWeightG);
        }
      } catch (err) {
        throw new ApiError(502, `解析に失敗しました。時間をおいてもう一度お試しください。（詳細: ${err instanceof Error ? err.message : String(err)}）`);
      }
      name = nameInput || estimate.name || "作り置き";
      calories = Number(estimate.calories) || 0;
      protein_g = Number(estimate.protein_g) || 0;
      fat_g = Number(estimate.fat_g) || 0;
      carb_g = Number(estimate.carb_g) || 0;
    }

    const prep = await createMealPrep(session.profile_id, { name, total_weight_g: totalWeightG, calories, protein_g, fat_g, carb_g });
    return NextResponse.json({ prep });
  } catch (e) {
    return errorResponse(e);
  }
}
