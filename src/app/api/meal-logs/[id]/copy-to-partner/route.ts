import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getMealLogById, createMealLog } from "@/lib/mealLog";
import { getAllProfiles, findPartnerOwner } from "@/lib/profiles";

/** 自分が登録した食事ログを、同じ内容でパートナーの食事ログとしても複製登録する
 * （「アリサも同じものを食べた」ボタン用）。 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;

    const source = await getMealLogById(id, session.profile_id);
    if (!source) throw new ApiError(404, "対象の食事ログが見つかりません");

    const profiles = await getAllProfiles();
    const partner = findPartnerOwner(profiles, session.profile_id);
    if (!partner) throw new ApiError(400, "パートナーが登録されていません");

    const log = await createMealLog(partner.id, {
      date: source.date,
      description: source.description,
      calories: source.calories,
      protein_g: source.protein_g,
      fat_g: source.fat_g,
      carb_g: source.carb_g,
    });
    return NextResponse.json({ log, partnerName: partner.name });
  } catch (e) {
    return errorResponse(e);
  }
}
