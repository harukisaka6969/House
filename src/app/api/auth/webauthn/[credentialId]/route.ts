import { NextResponse } from "next/server";
import { requireSession, errorResponse } from "@/lib/apiAuth";
import { deleteCredential } from "@/lib/webauthn";

export async function DELETE(_req: Request, ctx: { params: Promise<{ credentialId: string }> }) {
  try {
    const session = await requireSession();
    const { credentialId } = await ctx.params;
    const ok = await deleteCredential(session.profile_id, credentialId);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
