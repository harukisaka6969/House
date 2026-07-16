/**
 * 現行版（money-flow-dashboard.jsx）のエクスポートJSON（window.storage の
 * money-flow-dashboard-v1/v2 キー相当）をDBへ取り込む。spec §10。
 *
 *   npx tsx scripts/import.ts path/to/export.json
 *
 * 事前に scripts/seed.ts で haruki/arisa の profiles 行を作成しておくこと
 * （slugでマッチングする）。マッピング: p1→haruki, p2→arisa。
 * owner未設定の支出・投資行は haruki 帰属とする。
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import argon2 from "argon2";

interface LegacyIncome {
  id?: string;
  name: string;
  amount: number;
}
interface LegacyExpense {
  id?: string;
  date: string;
  account: string;
  category: string;
  sub?: string;
  amount: number;
  memo?: string;
  owner?: "p1" | "p2";
}
interface LegacyInvestment {
  id?: string;
  date: string;
  name: string;
  amount: number;
  memo?: string;
  owner?: "p1" | "p2";
}
interface LegacyExport {
  accounts: { id: string; name: string; color: string; budget: number }[];
  months: Record<string, { incomes: LegacyIncome[]; expenses: LegacyExpense[]; investments: LegacyInvestment[] }>;
  profiles: { id: "p1" | "p2"; name: string; pin?: string }[];
  customCategories: string[];
  otherCounts: Record<string, number>;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npx tsx scripts/import.ts path/to/export.json");
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const data = JSON.parse(readFileSync(path, "utf-8")) as LegacyExport;

  // p1/p2 → haruki/arisa の profile_id を解決
  const slugOf: Record<"p1" | "p2", string> = { p1: "haruki", p2: "arisa" };
  const profileIdOf: Record<"p1" | "p2", string> = { p1: "", p2: "" };
  for (const legacyId of ["p1", "p2"] as const) {
    const slug = slugOf[legacyId];
    const { data: row, error } = await supabase.from("profiles").select("id").eq("slug", slug).maybeSingle();
    if (error) throw error;
    if (!row) throw new Error(`profile /${slug} not found — run scripts/seed.ts first`);
    profileIdOf[legacyId] = row.id;

    const legacyProfile = data.profiles.find((p) => p.id === legacyId);
    if (legacyProfile?.pin) {
      const pin_hash = await argon2.hash(legacyProfile.pin);
      await supabase.from("profiles").update({ pin_hash, name: legacyProfile.name || undefined }).eq("id", row.id);
      console.log(`updated /${slug} PIN from import (change it after logging in)`);
    }
  }
  const ownerId = (o: "p1" | "p2" | undefined) => profileIdOf[o ?? "p1"];

  // 口座
  for (const a of data.accounts) {
    const { error } = await supabase.from("accounts").update({ name: a.name, color: a.color, budget: a.budget }).eq("id", a.id);
    if (error) throw error;
  }
  console.log(`accounts: updated ${data.accounts.length}`);

  // カスタムカテゴリ / その他カウント
  if (data.customCategories?.length) {
    const { error } = await supabase.from("custom_categories").upsert(data.customCategories.map((name) => ({ name })), { onConflict: "name" });
    if (error) throw error;
  }
  if (data.otherCounts) {
    const rows = Object.entries(data.otherCounts).map(([name, count]) => ({ name, count }));
    if (rows.length) {
      const { error } = await supabase.from("other_counts").upsert(rows, { onConflict: "name" });
      if (error) throw error;
    }
  }

  let incomeCount = 0;
  let expenseCount = 0;
  let investCount = 0;

  for (const [month, m] of Object.entries(data.months)) {
    if (m.incomes?.length) {
      const rows = m.incomes.map((i) => ({ month, name: i.name, amount: i.amount, owner: null }));
      const { error } = await supabase.from("incomes").insert(rows);
      if (error) throw error;
      incomeCount += rows.length;
    }
    if (m.expenses?.length) {
      const rows = m.expenses.map((e) => ({
        owner: ownerId(e.owner),
        date: e.date || `${month}-01`,
        account_id: e.account,
        category: e.category,
        sub: e.sub || null,
        amount: e.amount,
        memo: e.memo || "",
      }));
      const { error } = await supabase.from("expenses").insert(rows);
      if (error) throw error;
      expenseCount += rows.length;
    }
    if (m.investments?.length) {
      const rows = m.investments.map((iv) => ({
        owner: ownerId(iv.owner),
        date: iv.date || `${month}-01`,
        name: iv.name,
        amount: iv.amount,
        memo: iv.memo || "",
      }));
      const { error } = await supabase.from("investments").insert(rows);
      if (error) throw error;
      investCount += rows.length;
    }
  }

  console.log(`incomes: inserted ${incomeCount}`);
  console.log(`expenses: inserted ${expenseCount}`);
  console.log(`investments: inserted ${investCount}`);
  console.log("import complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
