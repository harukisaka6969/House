import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPin, getProfileBySlug } from "@/lib/pinAuth";
import { setSessionCookie } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/apiAuth";

const bodySchema = z.object({
  slug: z.string().min(1),
  pin: z.string().min(4).max(32),
});

export async function POST(req: Request) {
  try {
    const limited = rateLimit(`pin:${clientIp(req)}`, 20, 60_000);
    if (!limited.ok) {
      return NextResponse.json({ error: "しばらくしてから再試行してください" }, { status: 429 });
    }

    const body = bodySchema.parse(await req.json());
    const profile = await getProfileBySlug(body.slug);
    if (!profile) {
      return NextResponse.json({ error: "PINが違います" }, { status: 401 });
    }

    const result = await checkPin(profile, body.pin);
    if (!result.ok) {
      if (result.reason === "locked") {
        return NextResponse.json(
          { error: "試行回数の上限に達しました。しばらくしてから再試行してください。", locked_until: result.lockedUntil },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: "PINが違います" }, { status: 401 });
    }

    await setSessionCookie({ profile_id: profile.id, slug: profile.slug });
    return NextResponse.json({ profile: { id: profile.id, slug: profile.slug, name: profile.name } });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
