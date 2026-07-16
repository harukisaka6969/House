import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { runAdvisor } from "@/lib/anthropic";
import { buildAdvisorContext } from "@/lib/advisorContext";
import { getProfileById } from "@/lib/pinAuth";
import { nowMonthKeyJST, isValidMonthKey } from "@/lib/date";

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(40),
  month: z.string().optional(),
  // 任意: §12.3 分析出力から「このデータでアドバイザーに聞く」で差し込む追加コンテキスト（当月以外の期間の分析）
  extraContext: z.string().max(20000).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const limited = rateLimit(`ai:${session.profile_id}`, 60, 60 * 60 * 1000);
    if (!limited.ok) throw new ApiError(429, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");

    const body = bodySchema.parse(await req.json());
    const month = body.month && isValidMonthKey(body.month) ? body.month : nowMonthKeyJST();

    const profile = await getProfileById(session.profile_id);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

    let system = await buildAdvisorContext(session.profile_id, profile.name, month);
    if (body.extraContext) {
      system += `\n\n【追加コンテキスト（ユーザーが分析出力から差し込んだ、当月以外の期間を含むデータ）】\n${body.extraContext}\n上記の追加コンテキストにも、このシステムプロンプト冒頭の制約（推測の明示・売買推奨禁止・相手の第3口座は非公開）が同様に適用されます。`;
    }

    const reply = await runAdvisor(system, body.messages);
    return NextResponse.json({ reply });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
