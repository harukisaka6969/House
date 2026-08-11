import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { checkPin, changeCredential, getProfileById, kioskPinExists, getKioskAuthMethod } from "@/lib/pinAuth";
import { isValidPatternCode } from "@/lib/pattern";
import { lineNotifyAvailable } from "@/lib/lineNotify";
import { getAllCategories, getCustomCategories } from "@/lib/categories";
import { getAccounts } from "@/lib/accounts";
import { listFamilyAccounts } from "@/lib/familyAccounts";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const [profile, allCategories, customCategories, accounts, familyAccounts, kioskConfigured, kioskAuthMethod] = await Promise.all([
      getProfileById(session.profile_id),
      getAllCategories(),
      getCustomCategories(),
      getAccounts(),
      listFamilyAccounts(),
      kioskPinExists(),
      getKioskAuthMethod(),
    ]);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({
      profile: { id: profile.id, slug: profile.slug, name: profile.name, authMethod: profile.auth_method },
      allCategories,
      customCategories,
      accounts,
      familyAccounts,
      kioskConfigured,
      kioskAuthMethod,
      lineUserId: profile.line_user_id,
      lineNotifyAvailable: lineNotifyAvailable(),
      lineReminderTime: profile.line_reminder_time,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const putSchema = z
  .object({
    current_credential: z.string().min(4).max(32),
    new_auth_method: z.enum(["pin", "pattern"]),
    new_credential: z.string().min(4).max(32),
  })
  .refine(
    (b) => (b.new_auth_method === "pin" ? /^\d{4,8}$/.test(b.new_credential) : isValidPatternCode(b.new_credential)),
    { message: "新しい認証情報の形式が正しくありません", path: ["new_credential"] }
  );

export async function PUT(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { current_credential, new_auth_method, new_credential } = putSchema.parse(await req.json());
    const profile = await getProfileById(session.profile_id);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

    const result = await checkPin(profile, current_credential);
    if (!result.ok) {
      if (result.reason === "locked") {
        return NextResponse.json({ error: "試行回数の上限に達しました。しばらくしてから再試行してください。" }, { status: 429 });
      }
      return NextResponse.json({ error: "現在の認証情報が違います" }, { status: 401 });
    }

    await changeCredential(profile.id, new_auth_method, new_credential);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
