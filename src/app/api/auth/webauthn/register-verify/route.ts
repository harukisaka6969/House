import { NextResponse } from "next/server";
import { requireSession, errorResponse } from "@/lib/apiAuth";
import { verifyRegistration } from "@/lib/webauthn";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const { response, deviceName } = body ?? {};
    if (!response) return NextResponse.json({ error: "invalid request" }, { status: 400 });

    const result = await verifyRegistration(session.profile_id, response, deviceName ?? "");
    if (!result.verified) return NextResponse.json({ error: "検証に失敗しました" }, { status: 400 });
    return NextResponse.json({ verified: true });
  } catch (e) {
    return errorResponse(e);
  }
}
