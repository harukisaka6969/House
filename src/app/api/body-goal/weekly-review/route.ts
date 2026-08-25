import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { computeWeeklyBodyReview } from "@/lib/bodyGoalReview";

/** ボタンを押した時に呼ぶ想定（自動配信はしない）。過去7日の食事・筋トレ・体組成の記録を
 * 突き合わせてスコア化し、良かった点・改善点を返す。 */
export async function POST() {
  try {
    const session = await requireOwnerSession();
    const limited = rateLimit(`ai:${session.profile_id}`, 60, 60 * 60 * 1000);
    if (!limited.ok) throw new ApiError(429, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");
    const review = await computeWeeklyBodyReview(session.profile_id);
    return NextResponse.json({ review });
  } catch (e) {
    return errorResponse(e);
  }
}
