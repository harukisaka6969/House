import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfileBySlug } from "@/lib/pinAuth";
import { setSessionCookie } from "@/lib/session";
import { errorResponse } from "@/lib/apiAuth";

const bodySchema = z.object({ slug: z.string().min(1) });

/** ハルキ・アリサ（role=owner）専用: PIN入力なしでセッションを確立する。
 * 家族用・kiosk用アカウント（role=family/kiosk）はここでは絶対に許可しない
 * （PINロック画面を引き続き使う）— スラッグを直接叩かれても弾けるよう、
 * ロールチェックをこのエンドポイント自身にも必ず持たせる。 */
export async function POST(req: Request) {
  try {
    const { slug } = bodySchema.parse(await req.json());
    const profile = await getProfileBySlug(slug);
    if (!profile || profile.role !== "owner") {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }

    await setSessionCookie({ profile_id: profile.id, slug: profile.slug, role: profile.role });
    return NextResponse.json({ profile: { id: profile.id, slug: profile.slug, name: profile.name, role: profile.role } });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
