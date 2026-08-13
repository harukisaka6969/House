import { NextResponse } from "next/server";
import { requireSession, errorResponse } from "@/lib/apiAuth";
import { getProfileById } from "@/lib/pinAuth";
import { getAllProfiles, findPartnerOwner } from "@/lib/profiles";

export async function GET() {
  try {
    const session = await requireSession();
    const profile = await getProfileById(session.profile_id);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

    const allProfiles = await getAllProfiles();
    const partner = profile.role === "owner" ? findPartnerOwner(allProfiles, profile.id) : null;

    return NextResponse.json({
      profile: { id: profile.id, slug: profile.slug, name: profile.name, role: profile.role },
      partner: partner ? { id: partner.id, name: partner.name, slug: partner.slug } : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
