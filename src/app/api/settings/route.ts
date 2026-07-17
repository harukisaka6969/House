import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { checkPin, changePin, getProfileById } from "@/lib/pinAuth";
import { getAllCategories } from "@/lib/categories";
import { getAccounts } from "@/lib/accounts";
import { listFamilyAccounts } from "@/lib/familyAccounts";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const profile = await getProfileById(session.profile_id);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });
    const [customCategories, accounts, familyAccounts] = await Promise.all([
      getAllCategories(),
      getAccounts(),
      listFamilyAccounts(),
    ]);
    return NextResponse.json({
      profile: { id: profile.id, slug: profile.slug, name: profile.name },
      customCategories,
      accounts,
      familyAccounts,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const putSchema = z.object({
  current_pin: z.string().min(4).max(32),
  new_pin: z.string().regex(/^\d{4,8}$/, "PINは4〜8桁の数字にしてください"),
});

export async function PUT(req: Request) {
  try {
    const session = await requireOwnerSession();
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
