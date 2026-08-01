import "server-only";
import { getJournalEntriesInRange, getSportLogsInRange } from "./journal";
import { getExpensesInRange, monthRange } from "./expenses";
import { getMealLogsInRange } from "./mealLog";
import { getRehabLogsInRange } from "./rehabLog";
import { getIdeaNotesCreatedInRange } from "./ideaNotes";
import { getIncomes } from "./incomes";
import { isMaskedForViewer, sumAmount } from "./aggregate";
import { fmt } from "./judge";
import { nowMonthKeyJST } from "./date";
import type { RehabLogRow } from "./types";

const REHAB_KIND_LABEL: Record<string, string> = {
  impulse: "衝動ログ",
  dignity: "人の尊厳日記",
  reframe: "自己嫌悪を書き換える",
  love_check: "愛のチェック",
};

function summarizeRehab(log: RehabLogRow): string {
  const d = log.data as Record<string, unknown>;
  switch (log.kind) {
    case "impulse":
      return [d.trigger, d.action].filter(Boolean).join(" → ") || "（未記入）";
    case "dignity":
      return (d.person as string) || "（未記入）";
    case "reframe":
      return (d.judgment as string) || "（未記入）";
    case "love_check":
      return `${d.score ?? 50}%`;
    default:
      return "";
  }
}

export interface DigestData {
  journalText: string;
  expenseLines: string;
  monthContext: string;
  mealLines: string;
  sportLines: string;
  rehabLines: string;
  ideaLines: string;
}

/** 指定期間（[fromDate, toDateExclusive)）の、ownerに関する全ジャンルのデータをダイジェスト用テキストに集約する。
 * 支出は本人視点のマスキング（相手の第3口座は除外）を適用する。日記・リハビリ記録は本人のもののみ（他人には非公開のため）。 */
export async function gatherDigestData(ownerId: string, fromDate: string, toDateExclusive: string): Promise<DigestData> {
  const [journalRows, sportRows, expenseRows, mealRows, rehabRows, ideaRows] = await Promise.all([
    getJournalEntriesInRange(ownerId, fromDate, toDateExclusive),
    getSportLogsInRange(fromDate, toDateExclusive),
    getExpensesInRange(fromDate, toDateExclusive),
    getMealLogsInRange(ownerId, fromDate, toDateExclusive),
    getRehabLogsInRange(ownerId, fromDate, toDateExclusive),
    getIdeaNotesCreatedInRange(ownerId, fromDate, toDateExclusive),
  ]);

  const journalText = journalRows
    .filter((j) => j.owner === ownerId && j.body.trim())
    .map((j) => `${j.date}: ${j.body.trim()}`)
    .join("\n\n");

  const visibleExpenses = expenseRows.filter((e) => !isMaskedForViewer(e, ownerId));
  const expenseLines = visibleExpenses.map((e) => `${e.date} ${e.category}${e.sub ? `(${e.sub})` : ""} ${fmt(e.amount)}${e.memo ? ` ${e.memo}` : ""}`).join("\n");

  const monthKey = nowMonthKeyJST();
  const { from, toExclusive } = monthRange(monthKey);
  const [monthIncomes, monthExpenses] = await Promise.all([getIncomes(monthKey), getExpensesInRange(from, toExclusive)]);
  const monthIncomeTotal = sumAmount(monthIncomes);
  const monthExpenseVisible = sumAmount(monthExpenses.filter((e) => !isMaskedForViewer(e, ownerId)));
  const monthContext = `今期（${monthKey}、25日始まり）収入 ${fmt(monthIncomeTotal)} / 支出(自分視点) ${fmt(monthExpenseVisible)}`;

  const mealLines = mealRows.map((m) => `${m.date} ${m.description}（${Math.round(m.calories)}kcal）`).join("\n");
  const sportLines = sportRows
    .filter((s) => s.owner === ownerId)
    .map((s) => `${s.date} ${s.activity}${s.duration_minutes ? ` ${s.duration_minutes}分` : ""}${s.memo ? ` ${s.memo}` : ""}`)
    .join("\n");
  const rehabLines = rehabRows.map((r) => `${r.date} ${REHAB_KIND_LABEL[r.kind] ?? r.kind}: ${summarizeRehab(r)}`).join("\n");
  const ideaLines = ideaRows.map((n) => `${n.title || "(無題)"}: ${n.content.slice(0, 80)}`).join("\n");

  return { journalText, expenseLines, monthContext, mealLines, sportLines, rehabLines, ideaLines };
}

export function hasAnyContent(d: DigestData): boolean {
  return !!(d.journalText || d.expenseLines || d.mealLines || d.sportLines || d.rehabLines || d.ideaLines);
}

function block(title: string, body: string): string {
  return `【${title}】\n${body || "（記録なし）"}`;
}

export function buildDailyDigestPrompt(ownerName: string, date: string, d: DigestData): string {
  return `あなたは家計・生活ダッシュボード「坂家 家計フローダッシュボード」に組み込まれた、${ownerName}さん専用の日々の振り返りライターです。
以下は${date}（前日）の${ownerName}さんの記録です。これをもとに、自然な日本語の文章で「前日のまとめ」を書いてください。

含めてほしい要素（見出しや箇条書きにせず、自然な文章の流れの中に含める）:
- その日にあったことの簡潔な要約
- 良かった点
- 悪かった点・気になった点
- 次にどうすればいいか（改善提案・次の一歩）

文体は共感的で率直に、説教くさくならないように。全体で300〜500字程度。データにない事柄を断定しないこと。記録がほとんどない日は、その旨を正直に短く書いてよい。前置きやタイトルは不要で、本文のみを返してください。

${block("日記", d.journalText)}

${block("支出", d.expenseLines)}

${d.monthContext}

${block("食事", d.mealLines)}

${block("運動・スポーツ", d.sportLines)}

${block("個人の振り返り記録", d.rehabLines)}

${block("アイデアメモ", d.ideaLines)}`;
}

export function buildWeeklyDigestPrompt(ownerName: string, weekStart: string, weekEndInclusive: string, d: DigestData): string {
  return `あなたは家計・生活ダッシュボード「坂家 家計フローダッシュボード」に組み込まれた、${ownerName}さん専用の週次振り返りライターです。
以下は${weekStart}〜${weekEndInclusive}（先週、月曜〜日曜）の${ownerName}さんの記録です。これをもとに、自然な日本語の文章で「今週のダイジェスト」を書いてください。

含めてほしい要素（見出しや箇条書きにせず、自然な文章の流れの中に含める）:
- 週全体を通してあったことの要約（お金・食事・運動・気持ちの動きなど）
- 良かった点
- 悪かった点・気になった点
- 来週に向けてどうすればいいか

文体は共感的で率直に、説教くさくならないように。全体で500〜800字程度。データにない事柄を断定しないこと。記録が少ない週は、その旨を正直に書いてよい。前置きやタイトルは不要で、本文のみを返してください。

${block("日記（複数日分）", d.journalText)}

${block("支出（複数日分）", d.expenseLines)}

${d.monthContext}

${block("食事", d.mealLines)}

${block("運動・スポーツ", d.sportLines)}

${block("個人の振り返り記録", d.rehabLines)}

${block("アイデアメモ", d.ideaLines)}`;
}
