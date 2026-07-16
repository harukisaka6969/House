import { NextResponse } from "next/server";
import { requireSession, errorResponse } from "@/lib/apiAuth";
import { getProfileById } from "@/lib/pinAuth";
import { buildRegistrationOptions } from "@/lib/webauthn";

export async function POST() {
  try {
    const session = await requireSession();
    const profile = await getProfileById(session.profile_id);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });
    const options = await buildRegistrationOptions(profile);
    return NextResponse.json(options);
  } catch (e) {
    return errorResponse(e);
  }
}
