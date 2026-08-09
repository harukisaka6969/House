import "server-only";
import { todayStrJST } from "./date";
import { getReminders } from "./reminders";
import { resolveNextDate } from "./reminderRecurrence";
import { getInventoryItems, lowStockItems as filterLowStock } from "./inventory";
import { getAnniversaries } from "./anniversaries";
import { anniversariesOnDate } from "./anniversaryMath";
import { getJournalEntriesInRange } from "./journal";

const JOURNAL_EXCERPT_LEN = 120;

/** ownerId本人の日記から、今日と同じ月日で過去に書かれた一番直近の1件を探す（本人の分しか読めない）。 */
async function findOnThisDayJournalLine(ownerId: string, today: string): Promise<string | null> {
  const rows = await getJournalEntriesInRange(ownerId, "1970-01-01", today);
  const todayMD = today.slice(5);
  const match = [...rows].reverse().find((r) => r.date.slice(5) === todayMD && r.body.trim());
  if (!match) return null;
  const years = Number(today.slice(0, 4)) - Number(match.date.slice(0, 4));
  if (years <= 0) return null;
  const body = match.body.trim();
  const excerpt = body.length > JOURNAL_EXCERPT_LEN ? `${body.slice(0, JOURNAL_EXCERPT_LEN)}…` : body;
  return `📖 ${years}年前の今日、日記にこう書いていました:\n「${excerpt}」`;
}

/** 今日分のリマインダー・在庫切れ・記念日をまとめたLINEメッセージを作る。何も無ければnull。
 * ownerIdを渡すと、その人の日記から「N年前の今日」の一言も添える（日記は本人のみ閲覧可のため）。 */
export async function buildReminderDigestMessage(ownerId?: string): Promise<string | null> {
  const today = todayStrJST();
  const [reminderRows, inventoryRows, anniversaryRows] = await Promise.all([getReminders(), getInventoryItems(), getAnniversaries()]);

  const dueToday = reminderRows
    .filter((r) => r.active && !r.notify_time && resolveNextDate(r, today).next_date === today)
    .map((r) => r.name);
  const lowStock = filterLowStock(inventoryRows).map((i) => i.name);
  const todayAnniversaries = anniversariesOnDate(anniversaryRows, today);
  const onThisDayLine = ownerId ? await findOnThisDayJournalLine(ownerId, today) : null;

  if (dueToday.length === 0 && lowStock.length === 0 && todayAnniversaries.length === 0 && !onThisDayLine) return null;

  const lines = [`📋 ${today} の家計簿だより`];
  if (todayAnniversaries.length) lines.push("", "📅 今日は…", ...todayAnniversaries.map((a) => `・${a.text}`));
  if (dueToday.length) {
    lines.push("", "🔔 今日やること:", ...dueToday.map((n) => `・${n}`), "LINEで「完了」と送ると今日の分をまとめて完了にできるよ。");
  }
  if (lowStock.length) lines.push("", "📦 在庫が少ないもの:", ...lowStock.map((n) => `・${n}`));
  if (onThisDayLine) lines.push("", onThisDayLine);
  return lines.join("\n");
}
