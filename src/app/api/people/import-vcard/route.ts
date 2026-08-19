import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { parseVCard, importVCardContacts } from "@/lib/people";

const bodySchema = z.object({ vcard: z.string().min(1).max(3_000_000) });
const MAX_CONTACTS = 1000;

/** iPhone等からエクスポートしたvCard(.vcf)テキストを一括取り込みし、氏名・ニックネームを
 * 人物台帳の表記ゆれとして初期投入する。 */
export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const { vcard } = bodySchema.parse(await req.json());
    const contacts = parseVCard(vcard);
    if (contacts.length === 0) throw new ApiError(400, "vCardから連絡先を読み取れませんでした。");
    if (contacts.length > MAX_CONTACTS) throw new ApiError(400, `連絡先が多すぎます（${contacts.length}件）。${MAX_CONTACTS}件以下に分けてお試しください。`);
    const result = await importVCardContacts(contacts);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
