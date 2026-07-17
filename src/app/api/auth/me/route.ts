import { NextResponse } from "next/server";
import { requireSession, errorResponse } from "@/lib/apiAuth";
import { getProfileById } from "@/lib/pinAuth";
import { db } from "@/lib/db";
import { getAllProfiles, findPartnerOwner } from "@/lib/profiles";

export async function GET() {
  try {
    const session = await requireSession();
    const profile = await getProfileById(session.profile_id);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { data: devices, error } = await db()
      .from("webauthn_credentials")
      .select("id, device_name, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const allProfiles = await getAllProfiles();
    const partner = profile.role === "owner" ? findPartnerOwner(allProfiles, profile.id) : null;

    return NextResponse.json({
      profile: { id: profile.id, slug: profile.slug, name: profile.name, role: profile.role },
      partner: partner ? { name: partner.name, slug: partner.slug } : null,
      devices: devices ?? [],
    });
  } catch (e) {
    return errorResponse(e);
  }
}
