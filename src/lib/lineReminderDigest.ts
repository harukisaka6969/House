import "server-only";
import { todayStrJST } from "./date";
import { getReminders } from "./reminders";
import { resolveNextDate } from "./reminderRecurrence";
import { getInventoryItems, lowStockItems as filterLowStock } from "./inventory";

/** 今日分のリマインダー・在庫切れをまとめたLINEメッセージを作る。何も無ければnull。 */
export async function buildReminderDigestMessage(): Promise<string | null> {
  const today = todayStrJST();
  const [reminderRows, inventoryRows] = await Promise.all([getReminders(), getInventoryItems()]);

  const dueToday = reminderRows.filter((r) => r.active && resolveNextDate(r, today).next_date === today).map((r) => r.name);
  const lowStock = filterLowStock(inventoryRows).map((i) => i.name);
  if (dueToday.length === 0 && lowStock.length === 0) return null;

  const lines = [`📋 ${today} の家計簿だより`];
  if (dueToday.length) lines.push("", "🔔 今日やること:", ...dueToday.map((n) => `・${n}`));
  if (lowStock.length) lines.push("", "📦 在庫が少ないもの:", ...lowStock.map((n) => `・${n}`));
  return lines.join("\n");
}
