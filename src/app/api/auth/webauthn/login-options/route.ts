import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfileBySlug } from "@/lib/pinAuth";
import { buildAuthenticationOptions } from "@/lib/webauthn";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/apiAuth";

const bodySchema = z.object({ slug: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const limited = rateLimit(`webauthn-login:${clientIp(req)}`, 30, 60_000);
    if (!limited.ok) return NextResponse.json({ error: "しばらくしてから再試行してください" }, { status: 429 });

    const { slug } = bodySchema.parse(await req.json());
    const profile = await getProfileBySlug(slug);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

    const options = await buildAuthenticationOptions(profile);
    return NextResponse.json(options);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
