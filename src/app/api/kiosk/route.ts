import { NextResponse } from "next/server";
import { requireKioskOrOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";
import { getShoppingItems } from "@/lib/shoppingList";
import { getReminders } from "@/lib/reminders";
import { resolveNextDate } from "@/lib/reminderRecurrence";
import { getAccounts } from "@/lib/accounts";
import { getIncomes } from "@/lib/incomes";
import { getExpensesInRange, monthRange } from "@/lib/expenses";
import { getInvestmentsInRange } from "@/lib/investments";
import { buildPerAccount, buildMonthTotals, buildMonthJudge } from "@/lib/aggregate";
import { getInventoryItems, lowStockItems as filterLowStock } from "@/lib/inventory";
import { nowMonthKeyJST, todayStrJST } from "@/lib/date";
import type { ShoppingItemRow } from "@/lib/types";

/** 常設ダッシュボード（iPad等に常時表示する用）。owner本人であれば誰でも、世帯全体（ハルキ・アリサ両方）の
 * 買い物リスト・リマインダー・お金の概況・重要な通知をまとめて返す。個人の日記等プライベートな情報は含まない。 */
export async function GET() {
  try {
    const session = await requireKioskOrOwnerSession();
    const monthKey = nowMonthKeyJST();
    const { from, toExclusive } = monthRange(monthKey);

    const [profiles, shoppingRows, reminderRows, accounts, incomeRows, expenseRows, investRows, inventoryRows] = await Promise.all([
      getAllProfiles(),
      getShoppingItems(),
      getReminders(),
      getAccounts(),
      getIncomes(monthKey),
      getExpensesInRange(from, toExclusive),
      getInvestmentsInRange(from, toExclusive),
      getInventoryItems(),
    ]);

    const nameOf = makeNameLookup(profiles);
    const haruki = profiles.find((p) => p.slug === "haruki");
    const arisa = profiles.find((p) => p.slug === "arisa");
    if (!haruki || !arisa) return NextResponse.json({ error: "profiles not configured" }, { status: 500 });

    const toShoppingOut = (rows: ShoppingItemRow[]) =>
      rows.map((i) => ({
        id: i.id,
        owner: i.owner,
        owner_name: nameOf(i.owner),
        name: i.name,
        store: i.store,
        url: i.url,
        needs_approval: i.needs_approval,
        approved: i.approved,
        approved_by_name: i.approved_by ? nameOf(i.approved_by) : null,
        bought: i.bought,
        created_at: i.created_at,
      }));

    const activeShopping = shoppingRows.filter((r) => !r.bought);
    const leftItems = toShoppingOut(activeShopping.filter((r) => r.owner === haruki.id));
    const rightItems = toShoppingOut(activeShopping.filter((r) => r.owner === arisa.id));

    const perAccount = buildPerAccount(accounts, expenseRows, session.profile_id);
    const totals = buildMonthTotals(incomeRows, expenseRows, investRows);
    const judge = buildMonthJudge(totals);

    const today = todayStrJST();
    const reminders = reminderRows
      .filter((r) => r.active)
      .map((r) => {
        const { next_date, done_today } = resolveNextDate(r, today);
        return {
          id: r.id,
          name: r.name,
          recurrence_type: r.recurrence_type,
          day_of_week: r.day_of_week,
          day_of_month: r.day_of_month,
          memo: r.memo,
          active: r.active,
          next_date,
          done_today,
          last_completed_date: r.last_completed_date,
          notify_time: r.notify_time,
          assigned_to: r.assigned_to,
          assigned_to_name: r.assigned_to ? nameOf(r.assigned_to) : null,
          created_at: r.created_at,
        };
      })
      .sort((a, b) => a.next_date.localeCompare(b.next_date));

    const pendingApprovalItems = activeShopping
      .filter((r) => r.needs_approval && !r.approved)
      .map((r) => ({ id: r.id, name: r.name, owner_name: nameOf(r.owner) }));
    const remindersToday = reminders.filter((r) => r.next_date === today).map((r) => ({ id: r.id, name: r.name }));
    const lowStock = filterLowStock(inventoryRows).map((i) => ({ id: i.id, name: i.name }));

    const response: import("@/lib/apiTypes").KioskResponse = {
      monthKey,
      income: totals.income,
      expense: totals.expense,
      invest: totals.invest,
      judgeLabel: judge.label,
      judgeTone: judge.tone,
      accounts: perAccount.map((a) => ({
        id: a.id,
        name: a.name,
        color: a.color,
        budget: a.budget,
        spent: a.spent,
        judgeLabel: a.judge.label,
        judgeTone: a.judge.tone,
      })),
      reminders,
      left: { id: haruki.id, slug: haruki.slug, name: haruki.name, shoppingItems: leftItems },
      right: { id: arisa.id, slug: arisa.slug, name: arisa.name, shoppingItems: rightItems },
      notifications: { pendingApprovalItems, remindersToday, lowStockItems: lowStock },
    };

    return NextResponse.json(response);
  } catch (e) {
    return errorResponse(e);
  }
}
