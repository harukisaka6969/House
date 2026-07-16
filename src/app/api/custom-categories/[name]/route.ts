import { NextResponse } from "next/server";
import { requireSession, errorResponse } from "@/lib/apiAuth";
import { db } from "@/lib/db";

export async function DELETE(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    await requireSession();
    const { name } = await ctx.params;
    const { error } = await db().from("custom_categories").delete().eq("name", decodeURIComponent(name));
    if (error) throw error;
    // 過去にこのカテゴリを使った支出はそのまま残す（削除しない）。
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
