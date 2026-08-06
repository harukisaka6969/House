import { NextResponse } from "next/server";
import crypto from "crypto";
import { replyLineMessage, sendLineMessage, fetchLineImageContent } from "@/lib/lineNotify";
import { findProfileIdByLineUserId } from "@/lib/profiles";
import { getPendingApprovalsFor, approveShoppingItemAndNotify } from "@/lib/shoppingList";
import { classifyLinePhoto, estimateMealNutrition, ocrReceipt } from "@/lib/anthropic";
import { createMealLog } from "@/lib/mealLog";
import { addExpenseEntries, ValidationError as ExpenseValidationError } from "@/lib/expenses";
import { getAccounts } from "@/lib/accounts";
import { getAllCategories } from "@/lib/categories";
import { todayStrJST } from "@/lib/date";
import { rateLimit } from "@/lib/rateLimit";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; id?: string; text?: string };
}

const ID_MESSAGE = (userId: string) =>
  `あなたのLINEユーザーIDです。\n\n${userId}\n\nこれをコピーして、家計簿アプリの「設定」→「LINE通知」に貼り付けて保存してください。\n\n連携後は、このトークで「承認」と送ると買い物の承認待ちを承認、食事の写真やレシートの写真を送ると自動で記録できます。`;

async function reply(event: LineEvent, text: string): Promise<void> {
  if (event.replyToken) await replyLineMessage(event.replyToken, text);
  else if (event.source?.userId) await sendLineMessage(event.source.userId, text);
}

/** テキスト「承認」: 自分が承認できる（パートナーが追加した）承認待ちの買い物をすべて承認する。 */
async function handleApproveCommand(event: LineEvent, profileId: string): Promise<void> {
  const pending = await getPendingApprovalsFor(profileId);
  if (pending.length === 0) {
    await reply(event, "今、承認待ちのものはありません。");
    return;
  }
  const approvedNames: string[] = [];
  for (const item of pending) {
    const result = await approveShoppingItemAndNotify(item.id, profileId);
    if (result) approvedNames.push(result.name);
  }
  await reply(event, approvedNames.length ? `✅ 承認しました:\n${approvedNames.map((n) => `・${n}`).join("\n")}` : "承認に失敗しました。");
}

/** 画像メッセージ: 食事の写真かレシートの写真かをAIで判定し、それぞれ自動で記録する。 */
async function handleImageMessage(event: LineEvent, profileId: string): Promise<void> {
  const messageId = event.message?.id;
  if (!messageId) return;

  const limited = rateLimit(`ai:${profileId}`, 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await reply(event, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");
    return;
  }

  const content = await fetchLineImageContent(messageId);
  if (!content) {
    await reply(event, "画像の取得に失敗しました。もう一度送ってみてください。");
    return;
  }

  try {
    const kind = await classifyLinePhoto(content.base64, content.mediaType);

    if (kind === "meal") {
      const estimate = await estimateMealNutrition(content.base64, content.mediaType);
      await createMealLog(profileId, {
        date: todayStrJST(),
        description: estimate.description || "",
        calories: Number(estimate.calories) || 0,
        protein_g: Number(estimate.protein_g) || 0,
        fat_g: Number(estimate.fat_g) || 0,
        carb_g: Number(estimate.carb_g) || 0,
      });
      await reply(event, `🍚 食事を記録しました: ${estimate.description || "内容不明"}（約${Math.round(estimate.calories) || 0}kcal）`);
      return;
    }

    if (kind === "receipt") {
      const categories = await getAllCategories();
      const ocr = await ocrReceipt(content.base64, content.mediaType, categories);
      if (!ocr.total || ocr.total <= 0) {
        await reply(event, "レシートの金額を読み取れませんでした。アプリから登録してください。");
        return;
      }
      const accounts = await getAccounts();
      const account = accounts[0];
      if (!account) {
        await reply(event, "口座の設定が見つかりません。アプリから登録してください。");
        return;
      }
      const category = categories.includes(ocr.category) ? ocr.category : "その他";
      await addExpenseEntries(
        profileId,
        [{ date: ocr.date ?? undefined, account_id: account.id, category, amount: ocr.total, memo: ocr.store || "" }],
        categories
      );
      await reply(event, `🧾 支出を記録しました: ${ocr.store || "店名不明"} ${ocr.total.toLocaleString()}円（${category} / ${account.name}）`);
      return;
    }

    await reply(event, "写真の内容を認識できませんでした。食事の写真かレシートを送ってください。");
  } catch (e) {
    if (e instanceof ExpenseValidationError) {
      await reply(event, `記録に失敗しました: ${e.message}`);
      return;
    }
    console.error("LINE image handling failed", e);
    await reply(event, "読み取りに失敗しました。時間をおいてもう一度試すか、アプリから登録してください。");
  }
}

/** LINE公式アカウントのWebhook。友だち追加・メッセージ送信のたびに、送信者へ自分のユーザーIDを案内する
 * （通知を受け取るための設定を、家族が自分で完結できるようにするため）。連携済みなら「承認」コマンドや
 * 画像送信（食事写真・レシート写真の自動記録）も受け付ける。 */
export async function POST(req: Request) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  const bodyText = await req.text();

  if (secret) {
    const signature = req.headers.get("x-line-signature") ?? "";
    const expected = crypto.createHmac("sha256", secret).update(bodyText).digest("base64");
    if (signature !== expected) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(bodyText || "{}");
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  for (const event of payload.events ?? []) {
    const userId = event.source?.userId;
    if (!userId) continue;

    if (event.type === "message" && event.message?.type === "text") {
      const text = (event.message.text ?? "").trim();
      if (text === "承認") {
        const profileId = await findProfileIdByLineUserId(userId);
        if (!profileId) {
          await reply(event, "この操作をするには、まず家計簿アプリの「設定」→「LINE通知」でLINE連携をしてください。");
        } else {
          await handleApproveCommand(event, profileId);
        }
        continue;
      }
      await reply(event, ID_MESSAGE(userId));
      continue;
    }

    if (event.type === "message" && event.message?.type === "image") {
      const profileId = await findProfileIdByLineUserId(userId);
      if (!profileId) {
        await reply(event, "この写真を記録するには、まず家計簿アプリの「設定」→「LINE通知」でLINE連携をしてください。");
      } else {
        await handleImageMessage(event, profileId);
      }
      continue;
    }

    await reply(event, ID_MESSAGE(userId));
  }

  return NextResponse.json({ ok: true });
}
