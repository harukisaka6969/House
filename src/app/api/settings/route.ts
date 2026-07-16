import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, errorResponse } from "@/lib/apiAuth";
import { checkPin, changePin, getProfileById } from "@/lib/pinAuth";
import { getAllCategories } from "@/lib/categories";
import { getAccounts } from "@/lib/accounts";

export async function GET() {
  try {
    const session = await requireSession();
    const profile = await getProfileById(session.profile_id);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });
    const [customCategories, accounts] = await Promise.all([getAllCategories(), getAccounts()]);
    return NextResponse.json({
      profile: { id: profile.id, slug: profile.slug, name: profile.name },
      customCategories,
      accounts,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const putSchema = z.object({
  current_pin: z.string().min(4).max(32),
  new_pin: z.string().min(6).max(6).regex(/^\d{6}$/, "PINは6桁の数字にしてください"),
});

export async function PUT(req: Request) {
  try {
    const session = await requireSession();
    const { current_pin, new_pin } = putSchema.parse(await req.json());
    const profile = await getProfileById(session.profile_id);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

    const result = await checkPin(profile, current_pin);
    if (!result.ok) {
      if (result.reason === "locked") {
        return NextResponse.json({ error: "試行回数の上限に達しました。しばらくしてから再試行してください。" }, { status: 429 });
      }
      return NextResponse.json({ error: "現在のPINが違います" }, { status: 401 });
    }

    await changePin(profile.id, new_pin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
