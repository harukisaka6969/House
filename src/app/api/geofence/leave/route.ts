import { NextResponse } from "next/server";
import { z } from "zod";
import { markLeft } from "@/lib/homePresence";

const bodySchema = z.object({ token: z.string(), slug: z.string().min(1).max(40) });

/** iOSショートカットの「出発」オートメーションから呼ばれる想定のWebhook。 */
export async function POST(req: Request) {
  try {
    const secret = process.env.GEOFENCE_TOKEN;
    const { token, slug } = bodySchema.parse(await req.json());
    if (!secret || token !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    await markLeft(slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    console.error("geofence leave failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
