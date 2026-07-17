import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getAssets, createAsset } from "@/lib/assets";

export async function GET() {
  try {
    await requireOwnerSession();
    const assets = await getAssets();
    return NextResponse.json({ assets });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(["car", "house", "appliance", "other"]),
  acquired_date: z.string().optional().nullable(),
  memo: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const asset = await createAsset(input);
    return NextResponse.json({ asset });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
