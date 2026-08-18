import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { parseExpenseText } from "@/lib/anthropic";
import { getAllCategories } from "@/lib/categories";
import { getAccounts } from "@/lib/accounts";
import { businessDateJST } from "@/lib/date";

const bodySchema = z.object({ text: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const limited = rateLimit(`ai:${session.profile_id}`, 60, 60 * 60 * 1000);
    if (!limited.ok) throw new ApiError(429, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");

    const { text } = bodySchema.parse(await req.json());
    const [categories, accounts] = await Promise.all([getAllCategories(), getAccounts()]);
    const entries = await parseExpenseText(text, accounts, categories, businessDateJST());
    return NextResponse.json({ entries });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
