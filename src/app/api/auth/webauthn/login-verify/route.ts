import { NextResponse } from "next/server";
import { verifyAuthentication } from "@/lib/webauthn";
import { getProfileById } from "@/lib/pinAuth";
import { setSessionCookie } from "@/lib/session";
import { errorResponse } from "@/lib/apiAuth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.response) return NextResponse.json({ error: "invalid request" }, { status: 400 });

    const result = await verifyAuthentication(body.response);
    if (!result.verified || !result.profileId) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    const profile = await getProfileById(result.profileId);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

    await setSessionCookie({ profile_id: profile.id, slug: profile.slug });
    return NextResponse.json({ profile: { id: profile.id, slug: profile.slug, name: profile.name } });
  } catch (e) {
    return errorResponse(e);
  }
}
