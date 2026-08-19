import { NextResponse } from "next/server";
import crypto from "crypto";
import { replyLineMessage, sendLineMessage, fetchLineImageContent } from "@/lib/lineNotify";
import { findProfileIdByLineUserId, getAllProfiles, getLineRecipients } from "@/lib/profiles";
import { getPendingApprovalsFor, approveShoppingItemAndNotify, getShoppingItems, setShoppingItemBought } from "@/lib/shoppingList";
import { getDueRemindersToday, updateReminder } from "@/lib/reminders";
import { runSmartHomeTextCommand } from "@/lib/switchbotCommand";
import {
  classifyLinePhoto,
  classifyLineText,
  estimateMealNutrition,
  estimateMealNutritionFromText,
  ocrReceipt,
  parseExpenseText,
  extractIncomeFromText,
  estimateSavingsAction,
  matchSavingsAction,
  extractGymLogFromPhoto,
  extractGymLogFromText,
  type ExtractedGymItem,
} from "@/lib/anthropic";
import { createMealLog, getMealLogsInRange, getPfcTarget } from "@/lib/mealLog";
import { DEFAULT_PFC_TARGET } from "@/lib/pfcDefaults";
import { getExercises, createExercise, createLog as createGymLog, getOrCreateLineSplit, findExerciseByName } from "@/lib/gymLog";
import { formatSets } from "@/lib/gymSuggestion";
import type { GymExerciseRow } from "@/lib/types";
import { isDuplicateLineMessage } from "@/lib/lineDedup";
import { addExpenseEntries, ValidationError as ExpenseValidationError } from "@/lib/expenses";
import { getIncomes, replaceIncomes } from "@/lib/incomes";
import { getAccounts } from "@/lib/accounts";
import { getAllCategories } from "@/lib/categories";
import {
  listSavingsActions,
  createSavingsAction,
  createDiscountSavingsAction,
  createGiftCardSavingsAction,
  logSavingsActionOccurrence,
} from "@/lib/savingsActions";
import { todayStrJST, businessDateJST, nowMonthKeyJST, nextDayStr } from "@/lib/date";
import { rateLimit } from "@/lib/rateLimit";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; id?: string; text?: string };
}

const ID_MESSAGE = (userId: string) =>
  `あなたのLINEユーザーIDです。\n\n${userId}\n\nこれをコピーして、家計簿アプリの「設定」→「LINE通知」に貼り付けて保存してください。\n\n連携後は、このトークで「承認」と送ると買い物の承認待ちを承認、「完了」と送ると今日のリマインダーを完了、「買い物リスト」と送ると西友の買い物リストをふたりに送信（送った分は購入済みに）、食事・支出・収入・節約アクション・筋トレ・家電操作は文章でも写真でもそのまま送るだけで自動で処理できます。`;

const USAGE_HINT =
  "認識できませんでした。次のように送ってみてください。\n・食事「朝ごはんは卵かけご飯」\n・支出「コンビニで480円」\n・収入「給料25万円」\n・節約アクション「コーヒーを自炊した」\n・筋トレ「ベンチプレス60kg10回8回8回」\n・家電「リビングの照明つけて」「おやすみモード」\n・買い物の承認「承認」\n・今日のリマインダーを完了「完了」\n・西友の買い物リストを送信「買い物リスト」\n（食事・レシート・トレーニングノートの写真もそのまま送れます。複数枚まとめて送っても1枚ずつ処理します）";

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

/** テキスト「完了」: 今日が該当日で、まだ完了にしていないリマインダーをすべて完了にする。 */
async function handleCompleteCommand(event: LineEvent): Promise<void> {
  const today = todayStrJST();
  const due = await getDueRemindersToday(today);
  if (due.length === 0) {
    await reply(event, "今日、完了にできるリマインダーはありません。");
    return;
  }
  const completedNames: string[] = [];
  for (const r of due) {
    const result = await updateReminder(r.id, { done: true });
    if (result) completedNames.push(result.name);
  }
  await reply(event, completedNames.length ? `✅ 完了にしました:\n${completedNames.map((n) => `・${n}`).join("\n")}` : "完了にできませんでした。");
}

/** テキスト「買い物リスト」: 西友で買うもの（未購入分）をふたり両方のLINEにリストとして送り、
 * 送った分は購入済みにする（アプリの「西友へ通知」ボタンと同じ処理をLINEから起動できるようにしたもの）。 */
async function handleShoppingListCommand(event: LineEvent, profileId: string): Promise<void> {
  const recipients = await getLineRecipients();
  if (recipients.length === 0) {
    await reply(event, "LINE通知が未設定です。「設定」→「LINE通知」でユーザーIDを登録してください。");
    return;
  }
  const items = (await getShoppingItems()).filter((i) => i.store === "seiyu" && !i.bought);
  if (items.length === 0) {
    await reply(event, "西友で買うものは今ありません。");
    return;
  }
  const profiles = await getAllProfiles();
  const me = profiles.find((p) => p.id === profileId);
  const lines = [`🛒 西友の買い物リスト（${me?.name ?? "パートナー"}より）`, "", ...items.map((i) => `・${i.name}`)];
  await Promise.all(recipients.map((r) => sendLineMessage(r.line_user_id, lines.join("\n"))));
  await Promise.all(items.map((i) => setShoppingItemBought(i.id, true)));
}

/** その日の食事ログ合計を、pfc_targets（未設定ならDEFAULT_PFC_TARGET）に対する「何g中何g（%）」で
 * 3行にまとめる。食事を記録した直後の返信に添えて、単発のカロリーだけでなく1日の進み具合がわかるようにする。 */
async function formatDailyPfcSummary(profileId: string, date: string): Promise<string> {
  const [target, logs] = await Promise.all([getPfcTarget(profileId), getMealLogsInRange(profileId, date, nextDayStr(date))]);
  const t = target ?? DEFAULT_PFC_TARGET;
  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein_g: acc.protein_g + l.protein_g,
      fat_g: acc.fat_g + l.fat_g,
      carb_g: acc.carb_g + l.carb_g,
    }),
    { calories: 0, protein_g: 0, fat_g: 0, carb_g: 0 }
  );
  const pct = (actual: number, target: number) => (target > 0 ? Math.round((actual / target) * 100) : 0);
  return (
    `📊 今日の合計: ${Math.round(totals.calories)} / ${Math.round(t.calories)}kcal（${pct(totals.calories, t.calories)}%）\n` +
    `P: ${Math.round(totals.protein_g)} / ${Math.round(t.protein_g)}g（${pct(totals.protein_g, t.protein_g)}%）\n` +
    `F: ${Math.round(totals.fat_g)} / ${Math.round(t.fat_g)}g（${pct(totals.fat_g, t.fat_g)}%）\n` +
    `C: ${Math.round(totals.carb_g)} / ${Math.round(t.carb_g)}g（${pct(totals.carb_g, t.carb_g)}%）`
  );
}

async function handleMealText(event: LineEvent, profileId: string, text: string): Promise<void> {
  const estimate = await estimateMealNutritionFromText(text);
  const date = businessDateJST();
  await createMealLog(profileId, {
    date,
    description: estimate.description || "",
    calories: Number(estimate.calories) || 0,
    protein_g: Number(estimate.protein_g) || 0,
    fat_g: Number(estimate.fat_g) || 0,
    carb_g: Number(estimate.carb_g) || 0,
  });
  const summary = await formatDailyPfcSummary(profileId, date);
  await reply(event, `🍚 食事を記録しました: ${estimate.description || text}（約${Math.round(estimate.calories) || 0}kcal）\n\n${summary}`);
}

async function handleExpenseText(event: LineEvent, profileId: string, text: string): Promise<void> {
  const [categories, accounts] = await Promise.all([getAllCategories(), getAccounts()]);
  const parsed = await parseExpenseText(text, accounts, categories, businessDateJST());
  const valid = parsed.filter((p) => Number(p.amount) > 0);
  if (valid.length === 0) {
    await reply(event, "支出の内容を読み取れませんでした。金額を含めて送ってください。（例: コンビニで480円）");
    return;
  }
  const entries = valid.map((p) => {
    const currency = p.currency && p.currency.toUpperCase() !== "JPY" ? p.currency.toUpperCase() : null;
    return {
      date: p.date,
      account_id: accounts.some((a) => a.id === p.account) ? p.account! : (accounts[0]?.id ?? "a1"),
      category: p.category && categories.includes(p.category) ? p.category : "その他",
      amount: Number(p.amount),
      memo: p.memo || "",
      original_currency: currency,
      original_amount: currency ? Number(p.amount) : null,
    };
  });
  const { entries: resolved } = await addExpenseEntries(profileId, entries, categories);
  const total = resolved.reduce((s, e) => s + e.amount, 0);
  const summary = resolved
    .map((e) =>
      e.original_currency
        ? `・${e.memo || e.category} ${e.amount.toLocaleString()}円（${e.original_amount}${e.original_currency}）`
        : `・${e.memo || e.category} ${e.amount.toLocaleString()}円`
    )
    .join("\n");
  await reply(event, `🧾 支出を記録しました（計${total.toLocaleString()}円）:\n${summary}`);
}

async function handleIncomeText(event: LineEvent, profileId: string, text: string): Promise<void> {
  const parsed = await extractIncomeFromText(text);
  const amount = Math.round(Number(parsed.amount));
  if (!amount || amount <= 0) {
    await reply(event, "収入の金額を読み取れませんでした。金額を含めて送ってください。（例: 給料25万円）");
    return;
  }
  const monthKey = nowMonthKeyJST();
  const existing = await getIncomes(monthKey);
  const next = [
    ...existing.map((i) => ({ id: i.id, name: i.name, amount: i.amount, owner: i.owner })),
    { name: parsed.name || "収入", amount, owner: profileId },
  ];
  await replaceIncomes(monthKey, next);
  await reply(event, `💰 収入を記録しました: ${parsed.name || "収入"} ${amount.toLocaleString()}円（${monthKey}分）`);
}

/** 節約アクションの報告。既存カード一覧（直近100件）と照らし合わせ、同じ習慣の繰り返しと
 * 判断できれば新しいカードは作らず、既存カードの履歴に1件積む（カード枚数を増やさない）。
 * 新しい種類の行動ならAIで新規に見積もってカード化する。 */
async function handleSavingsText(event: LineEvent, profileId: string, text: string): Promise<void> {
  const existing = (await listSavingsActions()).slice(0, 100).map((a) => ({ id: a.id, title: a.title, keywords: a.keywords }));
  const matchedId = await matchSavingsAction(text, existing);
  if (matchedId) {
    try {
      const { card } = await logSavingsActionOccurrence({ action_id: matchedId, owner: profileId, date: todayStrJST() });
      await reply(event, `♻️ 節約履歴に追加しました（前回と同じ内容）: ${card.emoji} ${card.title} ${card.estimated_saving.toLocaleString()}円`);
      return;
    } catch (e) {
      console.error("logSavingsActionOccurrence failed, falling back to new card", e);
    }
  }
  const estimate = await estimateSavingsAction(text, todayStrJST());
  const row = await createSavingsAction({
    owner: profileId,
    date: todayStrJST(),
    description: text,
    title: estimate.title,
    estimated_saving: estimate.estimated_saving,
    reasoning: estimate.reasoning,
    keywords: estimate.keywords,
    emoji: estimate.emoji,
  });
  await reply(event, `💡 節約アクションを記録しました: ${row.emoji} ${row.title} ${row.estimated_saving.toLocaleString()}円`);
}

/** AIが抽出した種目ごとの記録を実際に登録する。既存の種目名と一致すればそのまま積み、一致しなければ
 * LINE専用の受け皿スプリット（getOrCreateLineSplit）に新規種目として追加する（アプリで作った部位別
 * スプリットを勝手に汚さないため）。写真・文章どちらの記録もここに合流する。 */
async function handleGymItems(event: LineEvent, profileId: string, exercises: GymExerciseRow[], items: ExtractedGymItem[]): Promise<void> {
  const usable = items.filter((it) => it.exercise_name && (it.sets.length > 0 || it.duration_minutes || it.distance_km));
  if (usable.length === 0) {
    await reply(event, "筋トレ・運動の内容を読み取れませんでした。種目名と重量・回数（または時間・距離）が分かるように送ってみてください。");
    return;
  }

  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  let lineSplitId: string | null = null;
  const today = todayStrJST();
  const summaries: string[] = [];

  for (const item of usable) {
    let exercise = item.matched_exercise_id ? exerciseById.get(item.matched_exercise_id) ?? null : null;
    if (!exercise) exercise = findExerciseByName(exercises, item.exercise_name);
    if (!exercise) {
      if (!lineSplitId) lineSplitId = (await getOrCreateLineSplit(profileId)).id;
      exercise = await createExercise(profileId, lineSplitId, item.exercise_name, exercises.length, item.type);
      exercises.push(exercise);
      exerciseById.set(exercise.id, exercise);
    }
    await createGymLog(profileId, exercise.id, today, {
      sets: item.sets,
      durationMinutes: item.duration_minutes,
      distanceKm: item.distance_km,
      note: item.note,
    });
    const summary =
      exercise.type === "cardio"
        ? [item.duration_minutes ? `${item.duration_minutes}分` : null, item.distance_km ? `${item.distance_km}km` : null].filter(Boolean).join(" ")
        : formatSets(item.sets);
    summaries.push(`${exercise.name}: ${summary}`);
  }

  await reply(event, `💪 筋トレを記録しました:\n${summaries.map((s) => `・${s}`).join("\n")}`);
}

async function handleGymText(event: LineEvent, profileId: string, text: string): Promise<void> {
  const exercises = await getExercises(profileId);
  const items = await extractGymLogFromText(text, exercises.map((e) => ({ id: e.id, name: e.name })));
  await handleGymItems(event, profileId, exercises, items);
}

/** 「承認」以外のテキストメッセージ: 食事・支出・収入のどれについてかをAIで判定し、それぞれ自動で記録する。 */
async function handleFreeText(event: LineEvent, profileId: string, text: string): Promise<void> {
  const limited = rateLimit(`ai:${profileId}`, 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await reply(event, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");
    return;
  }
  try {
    const intent = await classifyLineText(text);
    if (intent === "meal") return await handleMealText(event, profileId, text);
    if (intent === "expense") return await handleExpenseText(event, profileId, text);
    if (intent === "income") return await handleIncomeText(event, profileId, text);
    if (intent === "savings") return await handleSavingsText(event, profileId, text);
    if (intent === "gym") return await handleGymText(event, profileId, text);
    if (intent === "smarthome") return await reply(event, await runSmartHomeTextCommand(text));
    await reply(event, USAGE_HINT);
  } catch (e) {
    if (e instanceof ExpenseValidationError) {
      await reply(event, `記録に失敗しました: ${e.message}`);
      return;
    }
    console.error("LINE text handling failed", e);
    await reply(event, "読み取りに失敗しました。時間をおいてもう一度試すか、アプリから登録してください。");
  }
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
      const date = businessDateJST();
      await createMealLog(profileId, {
        date,
        description: estimate.description || "",
        calories: Number(estimate.calories) || 0,
        protein_g: Number(estimate.protein_g) || 0,
        fat_g: Number(estimate.fat_g) || 0,
        carb_g: Number(estimate.carb_g) || 0,
      });
      const summary = await formatDailyPfcSummary(profileId, date);
      await reply(event, `🍚 食事を記録しました: ${estimate.description || "内容不明"}（約${Math.round(estimate.calories) || 0}kcal）\n\n${summary}`);
      return;
    }

    if (kind === "gym") {
      const exercises = await getExercises(profileId);
      const items = await extractGymLogFromPhoto(content.base64, content.mediaType, exercises.map((e) => ({ id: e.id, name: e.name })));
      await handleGymItems(event, profileId, exercises, items);
      return;
    }

    if (kind === "receipt") {
      const [categories, accounts] = await Promise.all([getAllCategories(), getAccounts()]);
      const ocr = await ocrReceipt(content.base64, content.mediaType, categories, accounts);

      let redeemedNote = "";
      // ポイント・リワード等で商品代金が相殺されている明細があれば、支出とは別に節約履歴にも
      // 「無料で入手」として記録する（支払額0円・元の金額から節約額を確定計算）。
      if (ocr.redeemed_item && ocr.redeemed_original_price) {
        try {
          const savingsRow = await createDiscountSavingsAction(profileId, {
            item: ocr.redeemed_item,
            originalPrice: ocr.redeemed_original_price,
            pricePaid: 0,
            date: ocr.date ?? businessDateJST(),
          });
          redeemedNote = `\n${savingsRow.emoji} 節約履歴にも登録: ${savingsRow.title}（${savingsRow.estimated_saving.toLocaleString()}円節約、ポイント等で無料入手）`;
        } catch (e) {
          console.error("receipt redeemed-item savings action failed", e);
        }
      }

      const currency = ocr.currency && ocr.currency.toUpperCase() !== "JPY" ? ocr.currency.toUpperCase() : null;
      const total = ocr.total || 0;
      // 総合計のうち、ギフトカード（eGift等）で充当された分は実支出ではないため、支出額から差し引き、
      // 差し引いた分は別途「ギフトカードで節約」として節約履歴に記録する（外貨換算が絡む場合は対象外）。
      const giftCardAmount = !currency && ocr.gift_card_amount && ocr.gift_card_amount > 0 ? Math.min(ocr.gift_card_amount, total) : 0;
      const chargeAmount = total - giftCardAmount;

      if (!ocr.total || chargeAmount <= 0) {
        if (giftCardAmount > 0) {
          let giftCardNote = "";
          try {
            const savingsRow = await createGiftCardSavingsAction(profileId, {
              item: ocr.store || "購入品",
              giftCardAmount,
              date: ocr.date ?? businessDateJST(),
            });
            giftCardNote = `\n${savingsRow.emoji} 節約履歴にも登録: ${savingsRow.title}（${savingsRow.estimated_saving.toLocaleString()}円節約、ギフトカードで支払い）`;
          } catch (e) {
            console.error("receipt gift-card savings action failed", e);
          }
          await reply(event, `🎁 ギフトカードでの支払いとして記録しました。実際の追加支払いが無いため、支出としては記録していません。${giftCardNote}${redeemedNote}`);
        } else if (redeemedNote) {
          await reply(event, `🎁 ポイント等で無料入手として記録しました。実際の支払いが0円のため、支出としては記録していません。${redeemedNote}`);
        } else {
          await reply(event, "レシートの金額を読み取れませんでした。アプリから登録してください。");
        }
        return;
      }
      const account = accounts.find((a) => a.id === ocr.account) ?? accounts[0];
      if (!account) {
        await reply(event, "口座の設定が見つかりません。アプリから登録してください。");
        return;
      }
      const category = categories.includes(ocr.category) ? ocr.category : "その他";
      const { entries: resolved } = await addExpenseEntries(
        profileId,
        [
          {
            date: ocr.date ?? undefined,
            account_id: account.id,
            category,
            amount: chargeAmount,
            memo: ocr.store || "",
            original_currency: currency,
            original_amount: currency ? ocr.total : null,
            items: ocr.items,
          },
        ],
        categories
      );
      const jpyAmount = resolved[0]?.amount ?? chargeAmount;
      const currencyNote = currency ? `（${ocr.total}${currency}）` : "";
      let discountNote = "";
      // レシートに割引表示（○%OFFなど）が読み取れた場合は、支出とは別に節約履歴にも記録する（カードは作らない）。
      // 節約額はAIに推測させず、実際の支払額(円換算後)と割引率からサーバー側で確定計算する。
      if (ocr.discount_percent) {
        try {
          const savingsRow = await createDiscountSavingsAction(profileId, {
            item: ocr.store || "購入品",
            discountPercent: ocr.discount_percent,
            pricePaid: jpyAmount,
            date: ocr.date ?? businessDateJST(),
          });
          discountNote = `\n${savingsRow.emoji} 節約履歴にも登録: ${savingsRow.title}（${savingsRow.estimated_saving.toLocaleString()}円節約）`;
        } catch (e) {
          console.error("receipt discount savings action failed", e);
        }
      }
      let giftCardNote = "";
      if (giftCardAmount > 0) {
        try {
          const savingsRow = await createGiftCardSavingsAction(profileId, {
            item: ocr.store || "購入品",
            giftCardAmount,
            date: ocr.date ?? businessDateJST(),
          });
          giftCardNote = `\n${savingsRow.emoji} 節約履歴にも登録: ${savingsRow.title}（${savingsRow.estimated_saving.toLocaleString()}円節約、ギフトカードで支払い）`;
        } catch (e) {
          console.error("receipt gift-card savings action failed", e);
        }
      }
      await reply(event, `🧾 支出を記録しました: ${ocr.store || "店名不明"} ${jpyAmount.toLocaleString()}円${currencyNote}（${category} / ${account.name}）${discountNote}${giftCardNote}${redeemedNote}`);
      return;
    }

    await reply(event, "写真の内容を認識できませんでした。食事・レシート・トレーニングノートなどの写真を送ってください。");
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

    // LINEはWebhookがタイムアウトすると同じメッセージを再送することがあるため、
    // 同じmessage_idを二度処理しない（支出・食事などの重複登録を防ぐ）。
    const messageId = event.message?.id;
    if (messageId && (await isDuplicateLineMessage(messageId))) continue;

    if (event.type === "message" && event.message?.type === "text") {
      const text = (event.message.text ?? "").trim();
      const profileId = await findProfileIdByLineUserId(userId);
      if (!profileId) {
        await reply(event, ID_MESSAGE(userId));
        continue;
      }
      if (text === "承認") {
        await handleApproveCommand(event, profileId);
      } else if (text === "完了") {
        await handleCompleteCommand(event);
      } else if (text === "買い物リスト") {
        await handleShoppingListCommand(event, profileId);
      } else {
        await handleFreeText(event, profileId, text);
      }
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
