import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { generateYearTimelineHighlights } from "@/lib/yearTimeline";
import { rateLimit } from "@/lib/rateLimit";

const bodySchema = z.object({ year: z.number().int().min(2000).max(2200) });

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { year } = bodySchema.parse(await req.json());
    const limited = rateLimit(`year-timeline-gen:${session.profile_id}`, 5, 60 * 60 * 1000);
    if (!limited.ok) return NextResponse.json({ error: "生成回数の上限に達しました。しばらくしてから試してください。" }, { status: 429 });
    const row = await generateYearTimelineHighlights(session.profile_id, year);
    return NextResponse.json({ items: row.items, generatedAt: row.generated_at });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
