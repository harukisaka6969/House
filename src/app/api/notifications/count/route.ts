import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getNotificationCounts } from "@/lib/notifications";
import { getAllProfiles, findPartnerOwner } from "@/lib/profiles";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const profiles = await getAllProfiles();
    const partner = findPartnerOwner(profiles, session.profile_id);
    const counts = await getNotificationCounts(session.profile_id, partner?.id ?? null);
    return NextResponse.json(counts);
  } catch (e) {
    return errorResponse(e);
  }
}
