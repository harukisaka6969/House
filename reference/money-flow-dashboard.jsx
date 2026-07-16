import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar,
} from "recharts";

/* ============================================================
   家計フローダッシュボード
   大 → 小 の順で「お金の流れ」を追う縦一枚構成
   ============================================================ */

const STORAGE_KEY = "money-flow-dashboard-v2";
const LEGACY_KEY = "money-flow-dashboard-v1";
const PRIVATE_ACCOUNT = "a3"; // 第3口座: 相手の明細はカテゴリのみ表示

const DEFAULT_ACCOUNTS = [
  { id: "a1", name: "第1口座（生活費）", color: "#F5A524", budget: 180000 },
  { id: "a2", name: "第2口座（ローン等）", color: "#4C9AFF", budget: 0 },
  { id: "a3", name: "第3口座（趣味・娯楽・交際）", color: "#2FB8A6", budget: 60000 },
  { id: "a4", name: "第4口座（投資）", color: "#8B7CF6", budget: 80000 },
];

const DEFAULT_PROFILES = [
  { id: "p1", name: "ハルキ", pin: "" },
  { id: "p2", name: "アリサ", pin: "" },
];

const CATEGORIES = ["食費", "外食", "住居", "水道光熱", "通信", "交通", "日用品", "趣味", "ペット", "医療", "交際費", "旅行", "投資", "その他"];

const CAT_COLORS = ["#F5A524", "#2FB8A6", "#4C9AFF", "#8B7CF6", "#E86A92", "#6FCF6F", "#D9A0FF", "#FFB380", "#63C7E8", "#C9B458", "#FF8A7A", "#7FD1B9", "#B0A8FF", "#9AA4B2"];

const MENU = [
  ["summary", "① サマリー"],
  ["flow", "② お金の流れ"],
  ["accounts", "③ 口座・判定"],
  ["expenses", "④ 支出明細"],
  ["invest", "⑤ 投資"],
  ["sim", "⑥ シミュレーション"],
  ["settings", "⑦ 設定"],
];

function nowMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmt(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? "-¥" : "¥") + Math.abs(v).toLocaleString("ja-JP");
}
// カレンダーセル用の短縮表記（12,340 → 1.2万）
function fmtShort(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 10000) {
    const w = v / 10000;
    return (w >= 10 ? Math.round(w) : Math.round(w * 10) / 10) + "万";
  }
  return v.toLocaleString("ja-JP");
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function emptyMonth() {
  return { incomes: [{ id: uid(), name: "給与", amount: 0 }], expenses: [], investments: [] };
}
function defaultData() {
  return {
    accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
    months: {},
    profiles: DEFAULT_PROFILES.map((p) => ({ ...p })),
    activeProfile: "p1",
    customCategories: [], // 「その他」から昇格したカテゴリ
    otherCounts: {}, // その他の内容 → 入力回数
  };
}
// 旧バージョン（v1）データの引き継ぎ: 記録は全てp1（ハルキ）帰属、旧・趣味口座(a2)→新a3へ振替
function migrateV1(old) {
  const base = defaultData();
  const remap = { a1: "a1", a2: "a3", a3: "a1", a4: "a4" };
  const months = {};
  Object.entries(old.months || {}).forEach(([k, m]) => {
    months[k] = {
      incomes: (m.incomes || []).map((i) => ({ ...i })),
      expenses: (m.expenses || []).map((e) => ({ ...e, account: remap[e.account] || "a1", owner: "p1" })),
      investments: (m.investments || []).map((iv) => ({ ...iv, owner: "p1" })),
    };
  });
  return { ...base, months };
}
function withDefaults(d) {
  return {
    ...defaultData(),
    ...d,
    profiles: d.profiles && d.profiles.length ? d.profiles : DEFAULT_PROFILES.map((p) => ({ ...p })),
    customCategories: d.customCategories || [],
    otherCounts: d.otherCounts || {},
  };
}

/* ---------- 判定ロジック ---------- */
function accountJudge(spent, budget) {
  if (!budget) return { label: "予算未設定", tone: "muted" };
  const r = spent / budget;
  if (r <= 0.8) return { label: "余裕あり", tone: "good" };
  if (r <= 1.0) return { label: "順調", tone: "ok" };
  if (r <= 1.15) return { label: "注意", tone: "warn" };
  return { label: "使いすぎ", tone: "bad" };
}
function monthJudge(income, expense) {
  if (income <= 0 && expense <= 0) return { label: "データなし", tone: "muted", note: "収入と支出を入力すると判定します。" };
  if (income <= 0) return { label: "収入未入力", tone: "muted", note: "収入を入力すると貯蓄率を判定できます。" };
  const rate = (income - expense) / income;
  if (rate >= 0.25) return { label: "優秀", tone: "good", note: `貯蓄率 ${(rate * 100).toFixed(0)}%。この水準を維持できれば理想的。` };
  if (rate >= 0.1) return { label: "良好", tone: "ok", note: `貯蓄率 ${(rate * 100).toFixed(0)}%。健全なペース。` };
  if (rate >= 0) return { label: "注意", tone: "warn", note: `貯蓄率 ${(rate * 100).toFixed(0)}%。貯蓄余力がほぼない月。` };
  return { label: "使いすぎ", tone: "bad", note: `${fmt(expense - income)} の赤字。支出の内訳を確認。` };
}

const TONE_COLOR = { good: "#45C48F", ok: "#4C9AFF", warn: "#F5A524", bad: "#F26D5F", muted: "#93A0AE" };

/* ---------- Claude API ---------- */
async function callClaude(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, ...body }),
  });
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}
function joinText(data) {
  return (data.content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
}
// レシート画像 → {date, store, total, category}
async function ocrReceipt(file, cats = CATEGORIES) {
  const base64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("画像の読み込みに失敗"));
    r.readAsDataURL(file);
  });
  const resp = await callClaude({
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
        { type: "text", text: `このレシート画像を読み取り、次のJSONのみを返してください。前置きやコードブロックは不要です。
{"date":"YYYY-MM-DD（不明ならnull）","store":"店名","total":合計金額の数値,"category":"${cats.join("|")} のいずれか"}` },
      ],
    }],
  });
  const text = joinText(resp).replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}
// 文章 → 支出エントリ配列（例:「コンビニで480円でおにぎりを買った」）
async function parseExpenseText(text, accounts, cats = CATEGORIES) {
  const acctList = accounts.map((a) => `${a.id}=${a.name}`).join(", ");
  const resp = await callClaude({
    messages: [{
      role: "user",
      content: `次の日本語の文章から家計簿の支出エントリを抽出し、JSON配列のみを返してください。前置きやコードブロックは不要です。複数の支出が含まれる場合は複数要素にしてください。
今日の日付: ${todayStr()}（「昨日」等の相対表現はここから計算）
口座候補: ${acctList}。内容から最も適切な口座を選ぶこと（日常の生活必需品はa1、ローン返済はa2、趣味・娯楽・交際・レジャーはa3、投資関連はa4。判断がつかなければa1）。
カテゴリ候補: ${cats.join("|")}
形式: [{"date":"YYYY-MM-DD","account":"口座id","category":"カテゴリ","amount":金額の数値,"memo":"店名や品名"}]
文章: ${text}`,
    }],
  });
  const t = joinText(resp).replace(/```json|```/g, "").trim();
  const arr = JSON.parse(t);
  return Array.isArray(arr) ? arr : [arr];
}

/* ============================================================ */

export default function MoneyFlowDashboard() {
  const [data, setData] = useState(null);
  const [monthKey, setMonthKey] = useState(nowMonthKey());
  const [confirmReset, setConfirmReset] = useState(false);
  const [pinPrompt, setPinPrompt] = useState(null); // { targetId, value, err }
  const [view, setView] = useState("summary"); // MENUの各id | "quick"
  const [menuOpen, setMenuOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentMsgs, setAgentMsgs] = useState([]);
  const [agentBusy, setAgentBusy] = useState(false);

  /* ---- 永続化（v1からの引き継ぎ対応） ---- */
  useEffect(() => {
    (async () => {
      let next = null;
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r && r.value) next = withDefaults(JSON.parse(r.value));
      } catch {}
      if (!next) {
        try {
          const old = await window.storage.get(LEGACY_KEY);
          if (old && old.value) next = migrateV1(JSON.parse(old.value));
        } catch {}
      }
      setData(next || defaultData());
    })();
  }, []);
  useEffect(() => {
    if (!data) return;
    (async () => {
      try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch (e) { console.error("save failed", e); }
    })();
  }, [data]);

  /* ---- プロフィール ---- */
  const profiles = (data && data.profiles) || DEFAULT_PROFILES;
  const activeId = (data && data.activeProfile) || "p1";
  const me = profiles.find((p) => p.id === activeId) || profiles[0];
  const pname = (id) => (profiles.find((p) => p.id === id) || {}).name || "？";
  const requestSwitch = (targetId) => {
    if (targetId === activeId) return;
    const target = profiles.find((p) => p.id === targetId);
    if (target && target.pin) setPinPrompt({ targetId, value: "", err: "" });
    else setData((d) => ({ ...d, activeProfile: targetId }));
  };
  const confirmPin = () => {
    const target = profiles.find((p) => p.id === pinPrompt.targetId);
    if (target && pinPrompt.value === target.pin) {
      setData((d) => ({ ...d, activeProfile: pinPrompt.targetId }));
      setPinPrompt(null);
    } else {
      setPinPrompt((pp) => ({ ...pp, err: "PINが違います。", value: "" }));
    }
  };

  const month = (data && data.months[monthKey]) || emptyMonth();
  const updMonth = (fn) =>
    setData((d) => {
      const cur = d.months[monthKey] || month; // 未保存月は表示中のオブジェクトを引き継ぎIDのズレを防ぐ
      return { ...d, months: { ...d.months, [monthKey]: fn(cur) } };
    });

  /* ---- 集計 ---- */
  const calc = useMemo(() => {
    if (!data) return null;
    const income = month.incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const expense = month.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const invest = month.investments.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const perAccount = data.accounts.map((a) => {
      const rows = month.expenses.filter((e) => e.account === a.id);
      const spent = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const spentMine = rows.filter((e) => !e.owner || e.owner === activeId).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return { ...a, spent, spentMine, judge: accountJudge(spent, a.budget) };
    });
    // カテゴリ内訳: 第3口座の相手の明細は金額を含めない（カテゴリのみ公開のため）
    const breakdownRows = month.expenses.filter((e) => !(e.account === PRIVATE_ACCOUNT && e.owner && e.owner !== activeId));
    const catTotals = {};
    breakdownRows.forEach((e) => {
      const key = e.category || "その他";
      catTotals[key] = (catTotals[key] || 0) + (Number(e.amount) || 0);
    });
    const perCategory = Object.entries(catTotals).map(([name, value]) => ({ name, value })).filter((c) => c.value > 0);
    const perStock = {};
    month.investments.forEach((iv) => {
      perStock[iv.name] = (perStock[iv.name] || 0) + (Number(iv.amount) || 0);
    });
    const trend = Object.keys(data.months).sort().slice(-12).map((k) => {
      const m = data.months[k];
      return {
        month: k.slice(2).replace("-", "/"),
        収入: m.incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0),
        支出: m.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        投資: m.investments.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      };
    });
    const pm = data.months[shiftMonth(monthKey, -1)];
    const prev = pm ? {
      income: pm.incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0),
      expense: pm.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      invest: pm.investments.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    } : null;
    const cumInvest = Object.values(data.months).reduce((s, m) => s + m.investments.reduce((x, iv) => x + (Number(iv.amount) || 0), 0), 0);
    return {
      income, expense, invest, balance: income - expense,
      perAccount, perCategory,
      perStock: Object.entries(perStock).map(([name, value]) => ({ name, value })),
      judge: monthJudge(income, expense), trend,
      prev, cumInvest,
      topCats: [...perCategory].sort((a, b) => b.value - a.value).slice(0, 5),
    };
  }, [data, month, activeId, monthKey]);

  if (!data || !calc) {
    return <div style={{ minHeight: "100vh", background: "#101418", color: "#93A0AE", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>読み込み中…</div>;
  }

  // 前月比の表示用
  const dsub = (cur, pv) => (pv == null ? null : (cur - pv >= 0 ? "+" : "") + fmt(cur - pv) + " 前月比");

  // 使用可能カテゴリ（固定 + 「その他」から昇格したカスタム。その他は末尾）
  const allCats = [...CATEGORIES.filter((c) => c !== "その他"), ...(data.customCategories || []), "その他"];

  // 支出追加の共通処理: 日付未入力→今日 / 「その他」の内容を学習し3回で新カテゴリに昇格
  const addEntries = (entries) => {
    const counts = { ...(data.otherCounts || {}) };
    const customs = [...(data.customCategories || [])];
    const promoted = [];
    const prepared = entries.map((en) => {
      const e = { id: uid(), owner: activeId, memo: "", ...en };
      if (!e.date) e.date = todayStr(); // 日付を入力しなかったときはその日の日付
      if (e.category === "その他" && e.sub && e.sub.trim()) {
        const key = e.sub.trim();
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] >= 3 && !customs.includes(key) && !CATEGORIES.includes(key)) {
          customs.push(key);
          promoted.push(key);
        }
      }
      return e;
    });
    const cur = data.months[monthKey] || month;
    const months = { ...data.months, [monthKey]: { ...cur, expenses: [...cur.expenses, ...prepared] } };
    if (promoted.length) {
      // 昇格したカテゴリで、過去の「その他（同じ内容）」も付け替える
      Object.keys(months).forEach((k) => {
        months[k] = {
          ...months[k],
          expenses: months[k].expenses.map((x) =>
            x.category === "その他" && x.sub && promoted.includes(x.sub.trim())
              ? { ...x, category: x.sub.trim() }
              : x
          ),
        };
      });
    }
    setData({ ...data, months, otherCounts: counts, customCategories: customs });
    return promoted;
  };

  /* ---- AIアドバイザー ---- */
  const buildAgentContext = () => {
    const acctLines = calc.perAccount.map((a) => `- ${a.name}: 予算${fmt(a.budget)} / 使用${fmt(a.spent)}（判定: ${a.judge.label}）`).join("\n");
    const cats = calc.perCategory.map((c) => `${c.name} ${fmt(c.value)}`).join(", ");
    const trendLines = calc.trend.map((t) => `${t.month}: 収入${fmt(t.収入)} 支出${fmt(t.支出)} 投資${fmt(t.投資)}`).join("\n");
    // プライバシー: 相手の第3口座明細はエージェントにも渡さない
    const items = month.expenses
      .filter((e) => !(e.account === PRIVATE_ACCOUNT && e.owner && e.owner !== activeId))
      .slice(-40)
      .map((e) => `${e.date} ${(data.accounts.find((a) => a.id === e.account) || {}).name || ""} ${e.category} ${fmt(e.amount)} ${e.memo || ""}`)
      .join("\n");
    const invItems = month.investments.map((iv) => `${iv.date} ${iv.name} ${fmt(iv.amount)} ${iv.memo || ""}`).join("\n");
    const partner = profiles.filter((pp) => pp.id !== activeId).map((pp) => pp.name).join("・");
    return `あなたは「坂家」の家計ダッシュボードに組み込まれた家計アドバイザーAIです。以下のデータに基づき、日本語で簡潔（原則300字以内）、率直かつ具体的に分析・アドバイスしてください。データにない事柄は推測であると明示すること。特定の金融商品の売買推奨はしないこと。

【現在の利用者】${me.name}
【対象月】${monthKey}
【今月】収入 ${fmt(calc.income)} / 支出 ${fmt(calc.expense)} / 投資 ${fmt(calc.invest)} / 収支 ${fmt(calc.balance)} / 総合判定: ${calc.judge.label}
【口座別】
${acctLines}
【カテゴリ別支出】${cats || "なし"}
【月別推移】
${trendLines || "データなし"}
【今月の支出明細（相手のプライベート第3口座分は除外済み・直近40件）】
${items || "なし"}
【今月の投資】
${invItems || "なし"}
【累計投資額】${fmt(calc.cumInvest)}

注意: 第3口座は夫婦間のプライベート口座であり、${partner}の第3口座の明細はあなたにも渡されていません。内容を聞かれたら「非公開のため分かりません」と答えてください。`;
  };
  const agentProps = {
    open: agentOpen, setOpen: setAgentOpen,
    msgs: agentMsgs, setMsgs: setAgentMsgs,
    busy: agentBusy, setBusy: setAgentBusy,
    buildContext: buildAgentContext, meName: me.name,
  };

  if (view === "quick") {
    return (
      <div className="mf-root">
        <StyleTag />
        <QuickEntry
          data={data} month={month} monthKey={monthKey} updMonth={updMonth}
          addEntries={addEntries} allCats={allCats}
          activeId={activeId} me={me} profiles={profiles} pname={pname}
          requestSwitch={requestSwitch} pinPrompt={pinPrompt} setPinPrompt={setPinPrompt} confirmPin={confirmPin}
          onBack={() => setView("summary")}
        />
        <AgentWidget {...agentProps} />
      </div>
    );
  }

  return (
    <div className="mf-root">
      <StyleTag />

      {/* ================= ヘッダー ================= */}
      <header className="mf-header">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <div className="mf-menuwrap">
            <button className="mf-menubtn" aria-haspopup="true" aria-expanded={menuOpen} aria-label="メニュー"
              onClick={() => setMenuOpen((o) => !o)}>☰</button>
            <div className={"mf-drawer" + (menuOpen ? " open" : "")}>
              {MENU.map(([id, label]) => (
                <button key={id} className={"mf-drawitem" + (view === id ? " active" : "")}
                  onClick={() => { setView(id); setMenuOpen(false); }}>{label}</button>
              ))}
              <div className="mf-drawsep" />
              <button className="mf-drawitem" onClick={() => { setView("quick"); setMenuOpen(false); }}>⚡ クイック入力</button>
            </div>
          </div>
          <div>
            <div className="mf-eyebrow">SAKA HOUSEHOLD LEDGER</div>
            <h1 className="mf-title">家計フローダッシュボード</h1>
          </div>
        </div>
        <div className="mf-headright">
          <button className="mf-btn quick" onClick={() => setView("quick")}>⚡ 入力</button>
          <div className="mf-profiletabs" role="tablist" aria-label="入力者の切り替え">
            {profiles.map((p) => (
              <button key={p.id} role="tab" aria-selected={p.id === activeId}
                className={"mf-ptab" + (p.id === activeId ? " active" : "")}
                onClick={() => requestSwitch(p.id)}>
                {p.name}{p.pin ? " 🔒" : ""}
              </button>
            ))}
          </div>
          <div className="mf-monthnav">
            <button className="mf-iconbtn" onClick={() => setMonthKey(shiftMonth(monthKey, -1))} aria-label="前の月">‹</button>
            <span className="mf-monthlabel">{monthKey.replace("-", "年")}月</span>
            <button className="mf-iconbtn" onClick={() => setMonthKey(shiftMonth(monthKey, 1))} aria-label="次の月">›</button>
          </div>
        </div>
      </header>

      {pinPrompt && (
        <div className="mf-pinbar">
          <span>{pname(pinPrompt.targetId)} に切り替え: PINを入力</span>
          <input className="mf-input mf-mono" type="password" inputMode="numeric" autoFocus style={{ width: 110 }}
            value={pinPrompt.value}
            onChange={(e) => setPinPrompt((pp) => ({ ...pp, value: e.target.value, err: "" }))}
            onKeyDown={(e) => { if (e.key === "Enter") confirmPin(); }} />
          <button className="mf-btn primary" onClick={confirmPin}>確認</button>
          <button className="mf-btn ghost" onClick={() => setPinPrompt(null)}>やめる</button>
          {pinPrompt.err && <span style={{ color: "#F26D5F", fontSize: 12 }}>{pinPrompt.err}</span>}
        </div>
      )}

      {/* セクションはサイドペイン（左上☰）から切り替え */}

      <main className="mf-main">
        {/* ================= ① サマリー ================= */}
        {view === "summary" && (<section className="mf-section">
          <SectionHead no="01" title="今月のサマリー" sub="いちばん大きい視点。この月がどうだったか。" />
          <div className="mf-cards4">
            <StatCard label="収入" value={fmt(calc.income)} color="#E7ECF2" sub={dsub(calc.income, calc.prev && calc.prev.income)} />
            <StatCard label="支出" value={fmt(calc.expense)} color="#F26D5F" sub={dsub(calc.expense, calc.prev && calc.prev.expense)} />
            <StatCard label="投資" value={fmt(calc.invest)} color="#8B7CF6" sub={dsub(calc.invest, calc.prev && calc.prev.invest)} />
            <StatCard label="収支" value={(calc.balance > 0 ? "+" : "") + fmt(calc.balance)} color={calc.balance >= 0 ? "#45C48F" : "#F26D5F"} />
          </div>
          <div className="mf-judgecard" style={{ borderColor: TONE_COLOR[calc.judge.tone] }}>
            <div className="mf-judgelabel" style={{ color: TONE_COLOR[calc.judge.tone] }}>{calc.judge.label}</div>
            <div className="mf-judgenote">{calc.judge.note}</div>
          </div>
          {calc.topCats.length > 0 && (
            <div className="mf-panel">
              <div className="mf-paneltitle">支出トップカテゴリ</div>
              {calc.topCats.map((c) => (
                <div key={c.name} className="mf-catbar">
                  <span className="mf-catbarname">{c.name}</span>
                  <div className="mf-bar" style={{ flex: 1, marginTop: 0 }}>
                    <div className="mf-barfill" style={{ width: `${(c.value / calc.topCats[0].value) * 100}%`, background: "#F5A524" }} />
                  </div>
                  <span className="mf-mono mf-catbaramt">{fmt(c.value)}</span>
                </div>
              ))}
              <div className="mf-hint" style={{ opacity: 0.7 }}>相手の第3口座分は金額非公開のため含まれません。</div>
            </div>
          )}
          {calc.trend.length > 1 && (
            <div className="mf-panel">
              <div className="mf-paneltitle">月別推移（直近12ヶ月）</div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={calc.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" stroke="#93A0AE" fontSize={11} />
                    <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => (v / 10000) + "万"} width={44} />
                    <Tooltip contentStyle={TT} formatter={(v) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="収入" stroke="#45C48F" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="支出" stroke="#F26D5F" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="投資" stroke="#8B7CF6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>)}

        {/* ================= ② 流れ ================= */}
        {view === "flow" && (<section className="mf-section">
          <SectionHead no="02" title="お金の流れ" sub="収入がどの口座に配分され、どれだけ使われたか。" />
          <FlowDiagram income={calc.income} accounts={calc.perAccount} />
          <div className="mf-panel">
            <div className="mf-paneltitle">配分の詳細</div>
            <div className="mf-tabwrap">
              <div className="mf-tabhead"><span>口座</span><span>予算</span><span>使用</span><span>残り</span><span>消化率</span><span>判定</span></div>
              {calc.perAccount.map((a) => (
                <div key={a.id} className="mf-tabrow">
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span className="mf-dot" style={{ background: a.color }} />
                    <span className="mf-tabname">{a.name}</span>
                  </span>
                  <span className="mf-mono">{fmt(a.budget)}</span>
                  <span className="mf-mono">{fmt(a.spent)}</span>
                  <span className="mf-mono" style={{ color: a.budget - a.spent < 0 ? "#F26D5F" : undefined }}>{fmt(a.budget - a.spent)}</span>
                  <span className="mf-mono">{a.budget ? Math.round((a.spent / a.budget) * 100) + "%" : "—"}</span>
                  <span><span className="mf-chip" style={{ marginLeft: 0, color: TONE_COLOR[a.judge.tone], borderColor: TONE_COLOR[a.judge.tone] }}>{a.judge.label}</span></span>
                </div>
              ))}
            </div>
          </div>
          <SpendCalendar monthKey={monthKey} month={month} data={data} activeId={activeId} pname={pname} />
        </section>)}

        {/* ================= ③ 口座・判定 ================= */}
        {view === "accounts" && (<section className="mf-section">
          <SectionHead no="03" title="口座別の状況" sub="4つの口座それぞれの予算消化と判定。" />
          <div className="mf-acctgrid">
            {calc.perAccount.map((a) => {
              const rate = a.budget ? Math.min(a.spent / a.budget, 1.5) : 0;
              return (
                <div key={a.id} className="mf-acctcard">
                  <div className="mf-acctname">
                    <span className="mf-dot" style={{ background: a.color }} />
                    {a.name}
                    <span className="mf-chip" style={{ color: TONE_COLOR[a.judge.tone], borderColor: TONE_COLOR[a.judge.tone] }}>{a.judge.label}</span>
                  </div>
                  <div className="mf-acctnums">
                    <span className="mf-num">{fmt(a.spent)}</span>
                    <span className="mf-numsub"> / 予算 {fmt(a.budget)}</span>
                  </div>
                  <div className="mf-bar">
                    <div className="mf-barfill" style={{ width: `${Math.min(rate * 100, 100)}%`, background: a.spent > a.budget ? "#F26D5F" : a.color }} />
                  </div>
                  <div className="mf-numsub" style={{ marginTop: 4 }}>
                    残り {fmt(Math.max(a.budget - a.spent, 0))}{a.spent > a.budget && ` ／ 超過 ${fmt(a.spent - a.budget)}`}
                    {a.id === PRIVATE_ACCOUNT && <span> ／ うち{me.name}の分 {fmt(a.spentMine)} 🔒</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mf-hint" style={{ opacity: 0.75 }}>🔒 第3口座はプライベート口座。相手の明細はカテゴリのみ表示され、日付・金額・メモは互いに見えません（口座の月合計のみ共有）。</div>
          <AccountDetail data={data} month={month} activeId={activeId} pname={pname} />
        </section>)}

        {/* ================= ④ 支出明細 ================= */}
        {view === "expenses" && (<section className="mf-section">
          <SectionHead no="04" title="支出明細" sub={`いちばん細かい視点。${me.name}として入力します。文章・レシート写真・手入力に対応。`} />
          <ExpensePanel data={data} month={month} updMonth={updMonth} perCategory={calc.perCategory} activeId={activeId} pname={pname} allCats={allCats} addEntries={addEntries} />
        </section>)}

        {/* ================= ⑤ 投資 ================= */}
        {view === "invest" && (<section className="mf-section">
          <SectionHead no="05" title="投資" sub="今月の投資額・累計・銘柄別内訳と、銘柄リサーチ。" />
          <div className="mf-cards4" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            <StatCard label="今月の投資" value={fmt(calc.invest)} color="#8B7CF6" sub={dsub(calc.invest, calc.prev && calc.prev.invest)} />
            <StatCard label="累計投資額（記録全期間）" value={fmt(calc.cumInvest)} color="#E7ECF2" />
          </div>
          {calc.trend.length > 1 && (
            <div className="mf-panel">
              <div className="mf-paneltitle">月別投資額の推移</div>
              <div style={{ height: 180 }}>
                <ResponsiveContainer>
                  <LineChart data={calc.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" stroke="#93A0AE" fontSize={11} />
                    <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => (v / 10000) + "万"} width={44} />
                    <Tooltip contentStyle={TT} formatter={(v) => fmt(v)} />
                    <Line type="monotone" dataKey="投資" stroke="#8B7CF6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <InvestPanel month={month} updMonth={updMonth} perStock={calc.perStock} totalInvest={calc.invest} activeId={activeId} pname={pname} />
        </section>)}

        {/* ================= ⑥ シミュレーション ================= */}
        {view === "sim" && (<section className="mf-section">
          <SectionHead no="06" title="将来シミュレーション" sub="このペースが続いたら資産はどうなるか。楽観・悲観シナリオ付き。" />
          <SimPanel defaultIncome={calc.income} defaultExpense={calc.expense} />
        </section>)}

        {/* ================= ⑦ 設定 ================= */}
        {view === "settings" && (<section className="mf-section">
          <SectionHead no="07" title="設定" sub="収入・口座・プロフィールはいつでも調整できます。" />
          <div className="mf-panel">
            <div className="mf-paneltitle">プロフィール（坂家）</div>
            {profiles.map((p) => (
              <div key={p.id} className="mf-row">
                <input className="mf-input" style={{ flex: 2 }} value={p.name} placeholder="名前"
                  onChange={(e) => setData((d) => ({ ...d, profiles: d.profiles.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) }))} />
                {p.id === activeId ? (
                  <input className="mf-input mf-mono" style={{ flex: 1 }} type="password" inputMode="numeric" placeholder="PIN（空で解除）"
                    value={p.pin || ""}
                    onChange={(e) => setData((d) => ({ ...d, profiles: d.profiles.map((x) => (x.id === p.id ? { ...x, pin: e.target.value } : x)) }))} />
                ) : (
                  <span className="mf-numsub" style={{ flex: 1 }}>{p.pin ? "PIN設定済み 🔒" : "PINなし"}</span>
                )}
              </div>
            ))}
            <div className="mf-hint" style={{ opacity: 0.75 }}>
              PINは自分のプロフィールを選択中のみ変更できます。あくまで簡易ロックです — 同じアカウント内の共有データなので、厳密な秘匿ではありません。
            </div>
          </div>
          <div className="mf-panel">
            <div className="mf-paneltitle">今月の収入（変動に合わせて毎月調整可）</div>
            {month.incomes.map((inc) => (
              <div key={inc.id} className="mf-row">
                <input className="mf-input" style={{ flex: 2 }} value={inc.name} placeholder="収入源（給与・副業など）"
                  onChange={(e) => updMonth((m) => ({ ...m, incomes: m.incomes.map((x) => (x.id === inc.id ? { ...x, name: e.target.value } : x)) }))} />
                <input className="mf-input mf-mono" style={{ flex: 1 }} type="number" value={inc.amount || ""} placeholder="金額"
                  onChange={(e) => updMonth((m) => ({ ...m, incomes: m.incomes.map((x) => (x.id === inc.id ? { ...x, amount: Number(e.target.value) } : x)) }))} />
                <button className="mf-del" onClick={() => updMonth((m) => ({ ...m, incomes: m.incomes.filter((x) => x.id !== inc.id) }))}>削除</button>
              </div>
            ))}
            <button className="mf-btn ghost" onClick={() => updMonth((m) => ({ ...m, incomes: [...m.incomes, { id: uid(), name: "", amount: 0 }] }))}>＋ 収入源を追加</button>
          </div>

          <div className="mf-panel">
            <div className="mf-paneltitle">口座の名前と月次予算</div>
            {data.accounts.map((a) => (
              <div key={a.id} className="mf-row">
                <span className="mf-dot" style={{ background: a.color }} />
                <input className="mf-input" style={{ flex: 2 }} value={a.name}
                  onChange={(e) => setData((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)) }))} />
                <input className="mf-input mf-mono" style={{ flex: 1 }} type="number" value={a.budget || ""} placeholder="予算"
                  onChange={(e) => setData((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === a.id ? { ...x, budget: Number(e.target.value) } : x)) }))} />
              </div>
            ))}
          </div>

          {(data.customCategories || []).length > 0 && (
            <div className="mf-panel">
              <div className="mf-paneltitle">自動追加されたカテゴリ（「その他」の学習結果）</div>
              <div className="mf-chips">
                {data.customCategories.map((c) => (
                  <span key={c} className="mf-chipbtn on" style={{ cursor: "default" }}>
                    {c}
                    <button className="mf-del" style={{ padding: "0 2px", fontSize: 13 }} title="カテゴリを削除"
                      onClick={() => setData((d) => ({ ...d, customCategories: d.customCategories.filter((x) => x !== c) }))}>×</button>
                  </span>
                ))}
              </div>
              <div className="mf-hint" style={{ opacity: 0.7 }}>削除しても、このカテゴリを使った過去の記録はそのまま残ります。</div>
            </div>
          )}

          <div className="mf-panel">
            <div className="mf-paneltitle">データ管理</div>
            {!confirmReset ? (
              <button className="mf-btn danger" onClick={() => setConfirmReset(true)}>全データをリセット</button>
            ) : (
              <div className="mf-row">
                <span style={{ color: "#F26D5F", fontSize: 13 }}>全ての記録が消えます。元に戻せません。</span>
                <button className="mf-btn danger" onClick={() => { setData(defaultData()); setConfirmReset(false); }}>本当にリセットする</button>
                <button className="mf-btn ghost" onClick={() => setConfirmReset(false)}>やめる</button>
              </div>
            )}
          </div>
        </section>)}

        <footer className="mf-footer">データはこのブラウザ内に保存されます。投資に関する情報は参考情報であり、投資判断はご自身の責任で。</footer>
      </main>
      <AgentWidget {...agentProps} />
    </div>
  );
}

/* ============================================================
   🤖 AIアドバイザー（右下フローティング + ポップアップチャット）
   ============================================================ */
const AGENT_SUGGESTIONS = ["今月の使いすぎポイントは？", "貯蓄率を上げるには？", "先月と比べてどう？"];

function AgentWidget({ open, setOpen, msgs, setMsgs, busy, setBusy, buildContext, meName }) {
  const [input, setInput] = useState("");
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy, open]);

  const send = async (preset) => {
    const t = (preset != null ? preset : input).trim();
    if (!t || busy) return;
    const newMsgs = [...msgs, { role: "user", content: t }];
    setMsgs(newMsgs);
    setInput("");
    setBusy(true);
    try {
      const resp = await callClaude({
        max_tokens: 1200,
        system: buildContext(),
        messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
      });
      const text = joinText(resp) || "回答を生成できませんでした。";
      setMsgs([...newMsgs, { role: "assistant", content: text }]);
    } catch (e) {
      console.error(e);
      setMsgs([...newMsgs, { role: "assistant", content: "エラーが発生しました。もう一度試してください。" }]);
    }
    setBusy(false);
  };

  return (
    <>
      <button className="mf-fab" aria-label="AIアドバイザーを開く" onClick={() => setOpen(!open)}>
        {open ? "×" : "✦"}
      </button>
      {open && (
        <div className="mf-agent" role="dialog" aria-label="AIアドバイザー">
          <div className="mf-agenthead">
            <span><span style={{ color: "#F5A524" }}>✦</span> 家計アドバイザー</span>
            <span className="mf-row" style={{ marginTop: 0, gap: 6 }}>
              {msgs.length > 0 && <button className="mf-del" title="履歴をクリア" onClick={() => setMsgs([])}>クリア</button>}
              <button className="mf-del" onClick={() => setOpen(false)}>×</button>
            </span>
          </div>
          <div className="mf-agentbody" ref={bodyRef}>
            {msgs.length === 0 && (
              <div className="mf-agentintro">
                <div style={{ marginBottom: 8 }}>{meName}さん、今月のデータを見ながら分析やアドバイスができます。</div>
                {AGENT_SUGGESTIONS.map((s) => (
                  <button key={s} className="mf-chipbtn" style={{ marginBottom: 6, width: "100%" }} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={"mf-abub " + (m.role === "user" ? "user" : "ai")}>{m.content}</div>
            ))}
            {busy && <div className="mf-abub ai" style={{ opacity: 0.6 }}>考え中…</div>}
          </div>
          <div className="mf-agentfoot">
            <input className="mf-input" style={{ flex: 1 }} placeholder="質問を入力…" value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
            <button className="mf-btn primary" disabled={busy || !input.trim()} onClick={() => send()}>送信</button>
          </div>
          <div className="mf-agentnote">参考情報です。投資・重要な判断はご自身で。相手の第3口座の明細はAIにも渡していません。</div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   日別支出カレンダー（②のドリルダウン: どの日にいくら使ったか）
   ============================================================ */
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

function SpendCalendar({ monthKey, month, data, activeId, pname }) {
  const [selDay, setSelDay] = useState(null); // "YYYY-MM-DD"
  const [y, m] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDow = new Date(y, m - 1, 1).getDay();
  const today = todayStr();

  // 日別合計（相手の第3口座分は金額非公開のため除外。1日1件だと金額が特定できてしまうため）
  const totals = {};
  month.expenses.forEach((e) => {
    if (e.account === PRIVATE_ACCOUNT && e.owner && e.owner !== activeId) return;
    if (!e.date || !e.date.startsWith(monthKey)) return;
    totals[e.date] = (totals[e.date] || 0) + (Number(e.amount) || 0);
  });
  const maxDay = Math.max(1, ...Object.values(totals));
  const monthVisibleTotal = Object.values(totals).reduce((s, v) => s + v, 0);

  const dkey = (d) => `${monthKey}-${String(d).padStart(2, "0")}`;
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const acctColor = (id) => (data.accounts.find((a) => a.id === id) || {}).color || "#93A0AE";
  const dayRows = selDay
    ? month.expenses.filter((e) => e.date === selDay).sort((a, b) => (b.amount || 0) - (a.amount || 0))
    : [];

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">日別カレンダー（濃いほど支出が多い日）</div>
      <div className="mf-calgrid">
        {DOW.map((d, i) => (
          <div key={d} className={"mf-calhead" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={"e" + i} />;
          const key = dkey(d);
          const t = totals[key] || 0;
          return (
            <button key={key}
              className={"mf-calcell" + (selDay === key ? " sel" : "") + (key === today ? " today" : "")}
              style={t > 0 ? { background: `rgba(245,165,36,${(0.07 + 0.4 * (t / maxDay)).toFixed(2)})` } : undefined}
              onClick={() => setSelDay(selDay === key ? null : key)}>
              <span className="mf-calday">{d}</span>
              {t > 0 && <span className="mf-calamt mf-mono">{fmtShort(t)}</span>}
            </button>
          );
        })}
      </div>
      <div className="mf-hint" style={{ opacity: 0.65 }}>
        表示合計 {fmt(monthVisibleTotal)}。相手の第3口座分は金額非公開のため含まれません。日をタップすると明細が見られます。
      </div>

      {selDay && (
        <div style={{ marginTop: 10 }}>
          <div className="mf-paneltitle">{selDay.slice(5).replace("-", "/")} の明細（{dayRows.length}件 ／ 表示分計 {fmt(totals[selDay] || 0)}）</div>
          {dayRows.length === 0 ? (
            <div className="mf-empty">この日の支出はありません。</div>
          ) : (
            <div className="mf-list">
              {dayRows.map((e) => {
                const mine = !e.owner || e.owner === activeId;
                const masked = e.account === PRIVATE_ACCOUNT && !mine;
                return (
                  <div key={e.id} className="mf-listrow" style={masked ? { opacity: 0.75 } : undefined}>
                    <span className="mf-dot" style={{ background: acctColor(e.account) }} />
                    <span className="mf-listcat">{e.category}{!masked && e.sub ? `（${e.sub}）` : ""}</span>
                    {!mine && <span className="mf-ownerchip">{pname(e.owner)}</span>}
                    <span className="mf-listmemo">{masked ? "🔒 非公開" : e.memo}</span>
                    <span className="mf-mono mf-listamt">{masked ? "¥•••••" : fmt(e.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   口座詳細（③のドリルダウン: カテゴリ内訳 + 明細）
   ============================================================ */
function AccountDetail({ data, month, activeId, pname }) {
  const [sel, setSel] = useState(data.accounts[0].id);
  const acct = data.accounts.find((a) => a.id === sel) || data.accounts[0];
  const rows = month.expenses.filter((e) => e.account === sel);
  // 第3口座は相手の分の金額を集計から除外（カテゴリのみ公開のため）
  const visible = rows.filter((e) => !(sel === PRIVATE_ACCOUNT && e.owner && e.owner !== activeId));
  const cats = {};
  visible.forEach((e) => { cats[e.category] = (cats[e.category] || 0) + (Number(e.amount) || 0); });
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const maxV = catRows.length ? catRows[0][1] : 1;
  const sorted = [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">口座の詳細（ドリルダウン）</div>
      <div className="mf-chips">
        {data.accounts.map((a) => (
          <button key={a.id} className={"mf-chipbtn" + (sel === a.id ? " on" : "")} onClick={() => setSel(a.id)}>
            <span className="mf-dot" style={{ background: a.color }} />{a.name.replace(/（.*）/, "")}
          </button>
        ))}
      </div>
      <div className="mf-quicklabel">カテゴリ別金額{sel === PRIVATE_ACCOUNT ? "（相手の分は金額非公開のため除外）" : ""}</div>
      {catRows.length === 0 ? (
        <div className="mf-empty">この口座の支出はまだありません。</div>
      ) : (
        catRows.map(([name, v]) => (
          <div key={name} className="mf-catbar">
            <span className="mf-catbarname">{name}</span>
            <div className="mf-bar" style={{ flex: 1, marginTop: 0 }}>
              <div className="mf-barfill" style={{ width: `${(v / maxV) * 100}%`, background: acct.color }} />
            </div>
            <span className="mf-mono mf-catbaramt">{fmt(v)}</span>
          </div>
        ))
      )}
      {sorted.length > 0 && (
        <>
          <div className="mf-quicklabel">明細（{sorted.length}件）</div>
          <div className="mf-list">
            {sorted.map((e) => {
              const mine = !e.owner || e.owner === activeId;
              const masked = e.account === PRIVATE_ACCOUNT && !mine;
              return (
                <div key={e.id} className="mf-listrow" style={masked ? { opacity: 0.75 } : undefined}>
                  <span className="mf-mono mf-listdate">{masked ? "—" : (e.date || "").slice(5)}</span>
                  <span className="mf-listcat">{e.category}{!masked && e.sub ? `（${e.sub}）` : ""}</span>
                  {!mine && <span className="mf-ownerchip">{pname(e.owner)}</span>}
                  <span className="mf-listmemo">{masked ? "🔒 非公開" : e.memo}</span>
                  <span className="mf-mono mf-listamt">{masked ? "¥•••••" : fmt(e.amount)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   ⚡ クイック入力（スマホ向け・入力特化画面）
   ============================================================ */
function QuickEntry({ data, month, monthKey, updMonth, addEntries, allCats, activeId, me, profiles, pname, requestSwitch, pinPrompt, setPinPrompt, confirmPin, onBack }) {
  const [mode, setMode] = useState("manual"); // manual | text | photo
  const [form, setForm] = useState({ date: todayStr(), account: data.accounts[0].id, category: allCats[0], amount: "", memo: "", sub: "" });
  const [showOpt, setShowOpt] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [textIn, setTextIn] = useState("");
  const fileRef = useRef(null);

  const acct = data.accounts.find((a) => a.id === form.account) || data.accounts[0];
  const acctSpent = month.expenses.filter((e) => e.account === form.account).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const myTotal = month.expenses.filter((e) => !e.owner || e.owner === activeId).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const promoMsg = (promoted) => (promoted.length ? ` ✨「${promoted.join("、")}」を新カテゴリにしました` : "");

  const add = () => {
    if (!form.amount || Number(form.amount) <= 0) { setMsg("金額を入力してください。"); return; }
    const promoted = addEntries([{
      date: form.date, account: form.account, category: form.category,
      amount: Number(form.amount), memo: form.memo,
      sub: form.category === "その他" ? form.sub.trim() : undefined,
    }]);
    setMsg(`✓ 追加: ${form.category}${form.category === "その他" && form.sub ? `（${form.sub}）` : ""} ${fmt(Number(form.amount))}（${acct.name}）` + promoMsg(promoted));
    setForm((f) => ({ ...f, amount: "", memo: "", sub: "" }));
  };

  const qText = async () => {
    if (!textIn.trim() || busy) return;
    setBusy(true); setMsg("文章を解析中…");
    try {
      const entries = await parseExpenseText(textIn, data.accounts, allCats);
      const valid = entries.filter((p) => Number(p.amount) > 0);
      if (valid.length === 0) throw new Error("no entries");
      if (valid.length === 1) {
        const p = valid[0];
        setForm((f) => ({
          ...f,
          date: p.date || f.date,
          account: data.accounts.some((a) => a.id === p.account) ? p.account : f.account,
          amount: p.amount || f.amount,
          category: allCats.includes(p.category) ? p.category : f.category,
          memo: p.memo || f.memo,
        }));
        setMode("manual");
        setMsg(`解析成功: ${p.memo || ""} ${fmt(p.amount || 0)}（${p.category}）。内容を確認して追加してください。`);
      } else {
        const promoted = addEntries(valid.map((p) => ({
          date: p.date,
          account: data.accounts.some((a) => a.id === p.account) ? p.account : data.accounts[0].id,
          category: allCats.includes(p.category) ? p.category : "その他",
          amount: Number(p.amount),
          memo: p.memo || "",
        })));
        setMsg(`✓ ${valid.length}件を追加しました。下の一覧から修正できます。` + promoMsg(promoted));
      }
      setTextIn("");
    } catch (e) {
      console.error(e);
      setMsg("解析に失敗しました。手入力してください。");
    }
    setBusy(false);
  };

  const onFile = async (file) => {
    setBusy(true); setMsg("レシートを読み取り中…");
    try {
      const p = await ocrReceipt(file, allCats);
      setForm((f) => ({
        ...f,
        date: p.date || f.date,
        amount: p.total || f.amount,
        category: allCats.includes(p.category) ? p.category : f.category,
        memo: p.store || f.memo,
      }));
      setMode("manual");
      setMsg(`読み取り成功: ${p.store || "店名不明"} ${fmt(p.total || 0)}。内容を確認して追加してください。`);
    } catch (e) {
      console.error(e);
      setMsg("読み取りに失敗しました。手入力してください。");
    }
    setBusy(false);
  };

  const recent = [...month.expenses]
    .filter((e) => !e.owner || e.owner === activeId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);

  return (
    <div className="mf-quickwrap">
      <div className="mf-row" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <button className="mf-btn ghost" onClick={onBack}>‹ ダッシュボード</button>
        <div className="mf-profiletabs">
          {profiles.map((p) => (
            <button key={p.id} className={"mf-ptab" + (p.id === activeId ? " active" : "")} onClick={() => requestSwitch(p.id)}>
              {p.name}{p.pin ? " 🔒" : ""}
            </button>
          ))}
        </div>
      </div>

      {pinPrompt && (
        <div className="mf-pinbar" style={{ padding: "8px 0" }}>
          <span>{pname(pinPrompt.targetId)} に切り替え: PIN</span>
          <input className="mf-input mf-mono" type="password" inputMode="numeric" autoFocus style={{ width: 100 }}
            value={pinPrompt.value}
            onChange={(e) => setPinPrompt((pp) => ({ ...pp, value: e.target.value, err: "" }))}
            onKeyDown={(e) => { if (e.key === "Enter") confirmPin(); }} />
          <button className="mf-btn primary" onClick={confirmPin}>確認</button>
          <button className="mf-btn ghost" onClick={() => setPinPrompt(null)}>×</button>
          {pinPrompt.err && <span style={{ color: "#F26D5F", fontSize: 12 }}>{pinPrompt.err}</span>}
        </div>
      )}

      <div className="mf-quickhead">
        <span className="mf-eyebrow">QUICK ENTRY</span>
        <span className="mf-numsub">{monthKey.replace("-", "年")}月 ／ {me.name}の支出計 <b className="mf-mono" style={{ color: "#E7ECF2" }}>{fmt(myTotal)}</b></span>
      </div>

      {/* 入力方法タブ: 1画面1方法で迷わない */}
      <div className="mf-modetabs">
        {[["manual", "⌨️ 手入力"], ["text", "✍️ 文章"], ["photo", "📷 レシート"]].map(([m2, label]) => (
          <button key={m2} className={"mf-modetab" + (mode === m2 ? " active" : "")} onClick={() => setMode(m2)}>{label}</button>
        ))}
      </div>

      {mode === "manual" && (
        <>
          <div className="mf-steplabel"><span className="mf-stepnum">1</span>金額</div>
          <input className="mf-input mf-mono mf-amount" type="number" inputMode="numeric" placeholder="¥0"
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} />

          <div className="mf-steplabel"><span className="mf-stepnum">2</span>口座</div>
          <div className="mf-acctchips">
            {data.accounts.map((a) => (
              <button key={a.id} className={"mf-chipbtn" + (form.account === a.id ? " on" : "")} onClick={() => setForm({ ...form, account: a.id })}>
                <span className="mf-dot" style={{ background: a.color }} />{a.name.replace("口座", "")}
              </button>
            ))}
          </div>
          <div className="mf-numsub" style={{ marginTop: 6 }}>
            残り {fmt(Math.max(acct.budget - acctSpent, 0))}（使用 {fmt(acctSpent)} / 予算 {fmt(acct.budget)}）
            {form.account === PRIVATE_ACCOUNT && " 🔒 明細は相手に非公開"}
          </div>

          <div className="mf-steplabel"><span className="mf-stepnum">3</span>カテゴリ</div>
          <div className="mf-chips">
            {allCats.map((c) => (
              <button key={c} className={"mf-chipbtn" + (form.category === c ? " on" : "")} onClick={() => setForm({ ...form, category: c })}>{c}</button>
            ))}
          </div>
          {form.category === "その他" && (
            <>
              <input className="mf-input" style={{ marginTop: 8 }} placeholder="その他の内容（例: サウナ）"
                value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} />
              <div className="mf-hint" style={{ opacity: 0.7 }}>同じ内容を3回入力すると、自動で新しいカテゴリになります。</div>
            </>
          )}

          <button className="mf-optbtn" onClick={() => setShowOpt(!showOpt)}>{showOpt ? "▾" : "▸"} 詳細を追加（メモ・日付）— 任意</button>
          {showOpt && (
            <>
              <div className="mf-row" style={{ marginTop: 6 }}>
                <input className="mf-input" style={{ flex: 2 }} placeholder="メモ（店名など）" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
                <input className="mf-input" style={{ flex: 1, minWidth: 130 }} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="mf-hint" style={{ opacity: 0.7 }}>日付を空にすると今日の日付で登録されます。</div>
            </>
          )}

          <button className="mf-btn primary mf-bigbtn" style={{ width: "100%", marginTop: 14 }} onClick={add}>追加する</button>
        </>
      )}

      {mode === "text" && (
        <>
          <div className="mf-steplabel"><span className="mf-stepnum">✍</span>文章をそのまま書く</div>
          <textarea className="mf-input" rows={3} style={{ resize: "none", fontSize: 15, marginTop: 4 }}
            placeholder={"例: コンビニで480円でおにぎりを買った\n複数もOK: 昨日ガソリン5,000円とラーメン900円"}
            value={textIn} onChange={(e) => setTextIn(e.target.value)} />
          <div className="mf-hint" style={{ opacity: 0.7 }}>金額・カテゴリ・口座・日付をAIが推定します。1件なら手入力タブで確認してから追加、複数件はそのまま追加されます。日付がなければ今日として登録。</div>
          <button className="mf-btn primary mf-bigbtn" style={{ width: "100%", marginTop: 10 }} disabled={busy || !textIn.trim()} onClick={qText}>
            {busy ? "解析中…" : "解析する"}
          </button>
        </>
      )}

      {mode === "photo" && (
        <>
          <div className="mf-steplabel"><span className="mf-stepnum">📷</span>レシートを撮る・選ぶ</div>
          <button className="mf-photobox" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>
            {busy ? "読み取り中…" : "タップしてカメラ起動 / 画像を選択"}
          </button>
          <div className="mf-hint" style={{ opacity: 0.7 }}>店名・合計金額・カテゴリをAIが読み取り、手入力タブに反映します。内容を確認してから追加してください。</div>
        </>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onFile(f); e.target.value = ""; }} />

      {msg && <div className="mf-hint" style={{ background: "#181E25", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px" }}>{msg}</div>}

      {recent.length > 0 && (
        <div className="mf-panel" style={{ marginTop: 18 }}>
          <div className="mf-paneltitle">{me.name}の最近の入力</div>
          <div className="mf-list">
            {recent.map((e) => (
              <div key={e.id} className="mf-listrow">
                <span className="mf-mono mf-listdate">{(e.date || "").slice(5)}</span>
                <span className="mf-listcat">{e.category}{e.sub ? `（${e.sub}）` : ""}</span>
                <span className="mf-listmemo">{e.memo}</span>
                <span className="mf-mono mf-listamt">{fmt(e.amount)}</span>
                <button className="mf-del" onClick={() => updMonth((m) => ({ ...m, expenses: m.expenses.filter((x) => x.id !== e.id) }))}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   流れ図（収入 → 口座配分 → 使用状況）
   ============================================================ */
function FlowDiagram({ income, accounts }) {
  const totalBudget = accounts.reduce((s, a) => s + (a.budget || 0), 0);
  if (income <= 0 && totalBudget <= 0) {
    return <div className="mf-panel mf-empty">収入（⑦設定）と口座予算を入力すると、ここに配分の流れが表示されます。</div>;
  }
  const base = Math.max(income, totalBudget, 1);
  const ROW = 82;
  const H = 24 + accounts.length * ROW;
  const leftH = Math.max((income / base) * (H - 60), 10);
  const leftY = 24 + (H - 60 - leftH) / 2;

  // 左（収入）を各口座予算の比率で分割してリボンにする
  const divisor = Math.max(income, totalBudget, 1);
  let cursorLeft = leftY;
  const rows = accounts.map((a, i) => {
    const nodeH = Math.max(((a.budget || 0) / base) * (H - 80), 8);
    const srcH = income > 0 ? Math.max(leftH * ((a.budget || 0) / divisor), 3) : 0;
    const row = { ...a, y: 20 + i * ROW, nodeH: Math.min(nodeH, 56), srcY: cursorLeft, srcH };
    cursorLeft += srcH;
    return row;
  });
  const unalloc = income - totalBudget;

  return (
    <div className="mf-panel">
      <div className="mf-flowwrap">
        <svg viewBox={`0 0 640 ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="収入から口座への配分の流れ">
          <defs>
            {rows.map((r) => (
              <linearGradient key={r.id} id={`g-${r.id}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8B949E" stopOpacity="0.25" />
                <stop offset="100%" stopColor={r.color} stopOpacity="0.5" />
              </linearGradient>
            ))}
          </defs>
          {/* 収入ノード */}
          <rect x="20" y={leftY} width="18" height={leftH} rx="4" fill="#E7ECF2" opacity="0.9" />
          <text x="20" y={Math.max(leftY - 8, 12)} fill="#93A0AE" fontSize="11">収入</text>
          <text x="20" y={leftY + leftH + 16} fill="#E7ECF2" fontSize="12" className="mf-mono">{fmt(income)}</text>
          {/* リボンと口座ノード */}
          {rows.map((r) => {
            const x0 = 38, x1 = 250;
            const nodeY = r.y + 6;
            const path = `M ${x0} ${r.srcY} C ${x0 + 95} ${r.srcY}, ${x1 - 95} ${nodeY}, ${x1} ${nodeY}
                          L ${x1} ${nodeY + r.nodeH} C ${x1 - 95} ${nodeY + r.nodeH}, ${x0 + 95} ${r.srcY + r.srcH}, ${x0} ${r.srcY + r.srcH} Z`;
            const usedRate = r.budget ? Math.min(r.spent / r.budget, 1) : 0;
            return (
              <g key={r.id}>
                {income > 0 && <path d={path} fill={`url(#g-${r.id})`} />}
                <rect x={x1} y={nodeY} width="12" height={r.nodeH} rx="3" fill={r.color} />
                <text x={x1 + 24} y={r.y + 16} fill="#E7ECF2" fontSize="13">{r.name}</text>
                <text x={x1 + 24} y={r.y + 34} fill="#93A0AE" fontSize="11" className="mf-mono">
                  {fmt(r.spent)} / {fmt(r.budget)}（{r.budget ? Math.round((r.spent / r.budget) * 100) : 0}%）
                </text>
                <rect x={x1 + 24} y={r.y + 43} width="330" height="6" rx="3" fill="rgba(255,255,255,0.08)" />
                <rect x={x1 + 24} y={r.y + 43} width={330 * usedRate} height="6" rx="3" fill={r.spent > r.budget ? "#F26D5F" : r.color} />
                {r.spent > r.budget && <text x={x1 + 24} y={r.y + 64} fill="#F26D5F" fontSize="11">超過 {fmt(r.spent - r.budget)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mf-flowfoot">
        {unalloc > 0 && <span>未配分（自由に使える余力）: <b className="mf-mono" style={{ color: "#45C48F" }}>{fmt(unalloc)}</b></span>}
        {unalloc < 0 && <span style={{ color: "#F5A524" }}>予算合計が収入を {fmt(-unalloc)} 上回っています。予算か収入を見直してください。</span>}
      </div>
    </div>
  );
}

/* ============================================================
   支出パネル（手入力 + レシートOCR）
   ============================================================ */
function ExpensePanel({ data, month, updMonth, perCategory, activeId, pname, allCats, addEntries }) {
  const [form, setForm] = useState({ date: todayStr(), account: data.accounts[0].id, category: allCats[0], amount: "", memo: "", sub: "" });
  const [ocrState, setOcrState] = useState({ busy: false, msg: "" });
  const [textIn, setTextIn] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [filterAcct, setFilterAcct] = useState("all");
  const fileRef = useRef(null);

  const promoMsg = (promoted) => (promoted.length ? ` ✨「${promoted.join("、")}」を新カテゴリとして追加しました。` : "");

  const runText = async () => {
    if (!textIn.trim() || textBusy) return;
    setTextBusy(true); setOcrState({ busy: false, msg: "文章を解析中…" });
    try {
      const entries = await parseExpenseText(textIn, data.accounts, allCats);
      const valid = entries.filter((p) => Number(p.amount) > 0);
      if (valid.length === 0) throw new Error("no entries");
      if (valid.length === 1) {
        const p = valid[0];
        setForm((f) => ({
          ...f,
          date: p.date || f.date,
          account: data.accounts.some((a) => a.id === p.account) ? p.account : f.account,
          amount: p.amount || f.amount,
          category: allCats.includes(p.category) ? p.category : f.category,
          memo: p.memo || f.memo,
        }));
        setOcrState({ busy: false, msg: `解析成功: ${p.memo || ""} ${fmt(p.amount || 0)}（${p.category}）。内容を確認して「追加する」を押してください。` });
      } else {
        const promoted = addEntries(valid.map((p) => ({
          date: p.date,
          account: data.accounts.some((a) => a.id === p.account) ? p.account : data.accounts[0].id,
          category: allCats.includes(p.category) ? p.category : "その他",
          amount: Number(p.amount),
          memo: p.memo || "",
        })));
        setOcrState({ busy: false, msg: `${valid.length}件を追加しました: ${valid.map((p) => `${p.memo || p.category} ${fmt(p.amount)}`).join(" / ")}。明細から修正できます。` + promoMsg(promoted) });
      }
      setTextIn("");
    } catch (e) {
      console.error(e);
      setOcrState({ busy: false, msg: "文章の解析に失敗しました。手入力してください。" });
    }
    setTextBusy(false);
  };

  const addExpense = () => {
    if (!form.amount || Number(form.amount) <= 0) { setOcrState({ busy: false, msg: "金額を入力してください。" }); return; }
    const promoted = addEntries([{
      date: form.date, account: form.account, category: form.category,
      amount: Number(form.amount), memo: form.memo,
      sub: form.category === "その他" ? form.sub.trim() : undefined,
    }]);
    setForm((f) => ({ ...f, amount: "", memo: "", sub: "" }));
    setOcrState({ busy: false, msg: "✓ 追加しました。" + promoMsg(promoted) });
  };

  const runOcr = async (file) => {
    setOcrState({ busy: true, msg: "レシートを読み取り中…" });
    try {
      const parsed = await ocrReceipt(file, allCats);
      setForm((f) => ({
        ...f,
        date: parsed.date || f.date,
        amount: parsed.total || f.amount,
        category: allCats.includes(parsed.category) ? parsed.category : f.category,
        memo: parsed.store || f.memo,
      }));
      setOcrState({ busy: false, msg: `読み取り成功: ${parsed.store || "店名不明"} ${fmt(parsed.total || 0)}。内容を確認して追加してください。` });
    } catch (e) {
      console.error(e);
      setOcrState({ busy: false, msg: "読み取りに失敗しました。手入力するか、別の写真で試してください。" });
    }
  };

  const sorted = [...month.expenses]
    .filter((e) => filterAcct === "all" || e.account === filterAcct)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const acctName = (id) => (data.accounts.find((a) => a.id === id) || {}).name || "—";
  const acctColor = (id) => (data.accounts.find((a) => a.id === id) || {}).color || "#93A0AE";

  return (
    <>
      <div className="mf-panel">
        <div className="mf-paneltitle">支出を追加</div>
        <div className="mf-row" style={{ marginTop: 0, marginBottom: 10 }}>
          <input className="mf-input" style={{ flex: 1 }}
            placeholder="✍️ 文章で入力（例: コンビニで480円でおにぎりを買った）"
            value={textIn} onChange={(e) => setTextIn(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runText(); }} />
          <button className="mf-btn ghost" disabled={textBusy || !textIn.trim()} onClick={runText}>{textBusy ? "解析中…" : "解析"}</button>
        </div>
        <div className="mf-formgrid">
          <input className="mf-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <select className="mf-input" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="mf-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="mf-input mf-mono" type="number" placeholder="金額" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="mf-input" placeholder="メモ（店名など）" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
        {form.category === "その他" && (
          <div style={{ marginTop: 8 }}>
            <input className="mf-input" placeholder="その他の内容（例: サウナ）" value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} />
            <div className="mf-hint" style={{ opacity: 0.7 }}>同じ内容を3回入力すると、自動で新しいカテゴリになります。</div>
          </div>
        )}
        <div className="mf-hint" style={{ opacity: 0.6 }}>日付を空にすると今日の日付で登録されます。</div>
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" onClick={addExpense}>追加する</button>
          <button className="mf-btn ghost" disabled={ocrState.busy} onClick={() => fileRef.current && fileRef.current.click()}>
            {ocrState.busy ? "読み取り中…" : "📷 レシートから読み取る"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) runOcr(f); e.target.value = ""; }} />
        </div>
        {ocrState.msg && <div className="mf-hint">{ocrState.msg}</div>}
      </div>

      {perCategory.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">カテゴリ別内訳</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={perCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {perCategory.map((c, i) => <Cell key={c.name} fill={CAT_COLORS[i % CAT_COLORS.length]} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={TT} formatter={(v) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mf-hint" style={{ opacity: 0.7 }}>第3口座の相手の入力は金額非公開のため、この内訳には含まれません。</div>
        </div>
      )}

      <div className="mf-panel">
        <div className="mf-paneltitle">明細（{sorted.length}件）</div>
        <div className="mf-chips" style={{ marginBottom: 8 }}>
          <button className={"mf-chipbtn" + (filterAcct === "all" ? " on" : "")} onClick={() => setFilterAcct("all")}>全て</button>
          {data.accounts.map((a) => (
            <button key={a.id} className={"mf-chipbtn" + (filterAcct === a.id ? " on" : "")} onClick={() => setFilterAcct(a.id)}>
              <span className="mf-dot" style={{ background: a.color }} />{a.name.replace(/（.*）/, "")}
            </button>
          ))}
        </div>
        {sorted.length === 0 ? (
          <div className="mf-empty">まだ支出がありません。上のフォームかレシート写真から追加できます。</div>
        ) : (
          <div className="mf-list">
            {sorted.map((e) => {
              const mine = !e.owner || e.owner === activeId;
              const masked = e.account === PRIVATE_ACCOUNT && !mine;
              return (
                <div key={e.id} className="mf-listrow" style={masked ? { opacity: 0.75 } : undefined}>
                  <span className="mf-mono mf-listdate">{masked ? "—" : (e.date || "").slice(5)}</span>
                  <span className="mf-dot" style={{ background: acctColor(e.account) }} title={acctName(e.account)} />
                  <span className="mf-listcat">{e.category}{!masked && e.sub ? `（${e.sub}）` : ""}</span>
                  {!mine && <span className="mf-ownerchip">{pname(e.owner)}</span>}
                  <span className="mf-listmemo">{masked ? "🔒 非公開" : e.memo}</span>
                  <span className="mf-mono mf-listamt">{masked ? "¥•••••" : fmt(e.amount)}</span>
                  {mine ? (
                    <button className="mf-del" onClick={() => updMonth((m) => ({ ...m, expenses: m.expenses.filter((x) => x.id !== e.id) }))}>×</button>
                  ) : (
                    <span className="mf-del" style={{ cursor: "default", opacity: 0.3 }} title="相手の記録は削除できません">·</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   投資パネル（記録 + 銘柄リサーチ）
   ============================================================ */
function InvestPanel({ month, updMonth, perStock, totalInvest, activeId, pname }) {
  const [form, setForm] = useState({ date: todayStr(), name: "", amount: "", memo: "" });
  const [query, setQuery] = useState("");
  const [research, setResearch] = useState({ busy: false, text: "", err: "" });

  const addInvest = () => {
    if (!form.name || !form.amount) return;
    updMonth((m) => ({ ...m, investments: [...m.investments, { id: uid(), ...form, amount: Number(form.amount), owner: activeId }] }));
    setForm((f) => ({ ...f, name: "", amount: "", memo: "" }));
  };

  const runResearch = async () => {
    if (!query.trim()) return;
    setResearch({ busy: true, text: "", err: "" });
    try {
      const resp = await callClaude({
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `個人投資家向けに、次のテーマ・銘柄について最新情報を調べて日本語で簡潔にまとめてください。概要、直近の動向、代表的な投資手段（銘柄・ETF・投信など）、留意すべきリスクを含めてください。特定の売買推奨はせず、事実ベースで。\n\nテーマ: ${query}`,
        }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      });
      const text = joinText(resp);
      setResearch({ busy: false, text: text || "結果を取得できませんでした。", err: "" });
    } catch (e) {
      console.error(e);
      setResearch({ busy: false, text: "", err: "リサーチに失敗しました。もう一度試してください。" });
    }
  };

  const sorted = [...month.investments].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <>
      <div className="mf-panel">
        <div className="mf-paneltitle">投資を記録（今月合計: <span className="mf-mono" style={{ color: "#8B7CF6" }}>{fmt(totalInvest)}</span>）</div>
        <div className="mf-formgrid">
          <input className="mf-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <input className="mf-input" placeholder="投資先（銘柄・ETF・投信名）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="mf-input mf-mono" type="number" placeholder="金額" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="mf-input" placeholder="メモ（NISA枠など）" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" onClick={addInvest}>記録する</button>
        </div>
      </div>

      <div className="mf-twocol">
        <div className="mf-panel">
          <div className="mf-paneltitle">投資先の内訳</div>
          {perStock.length === 0 ? (
            <div className="mf-empty">記録するとここに内訳が表示されます。</div>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={perStock} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {perStock.map((s, i) => <Cell key={s.name} fill={CAT_COLORS[i % CAT_COLORS.length]} stroke="none" />)}
                  </Pie>
                  <Tooltip contentStyle={TT} formatter={(v) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {sorted.length > 0 && (
            <div className="mf-list" style={{ marginTop: 8 }}>
              {sorted.map((iv) => {
                const mine = !iv.owner || iv.owner === activeId;
                return (
                  <div key={iv.id} className="mf-listrow">
                    <span className="mf-mono mf-listdate">{(iv.date || "").slice(5)}</span>
                    <span className="mf-listcat">{iv.name}</span>
                    {!mine && <span className="mf-ownerchip">{pname(iv.owner)}</span>}
                    <span className="mf-listmemo">{iv.memo}</span>
                    <span className="mf-mono mf-listamt">{fmt(iv.amount)}</span>
                    {mine ? (
                      <button className="mf-del" onClick={() => updMonth((m) => ({ ...m, investments: m.investments.filter((x) => x.id !== iv.id) }))}>×</button>
                    ) : (
                      <span className="mf-del" style={{ cursor: "default", opacity: 0.3 }} title="相手の記録は削除できません">·</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mf-panel">
          <div className="mf-paneltitle">銘柄・テーマをリサーチ（Web検索）</div>
          <div className="mf-row">
            <input className="mf-input" style={{ flex: 1 }} placeholder="例: 高配当ETF / 半導体関連 / 新NISAで積立できるインデックス"
              value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="mf-btn primary" disabled={research.busy} onClick={runResearch}>{research.busy ? "調査中…" : "調べる"}</button>
          </div>
          {research.err && <div className="mf-hint" style={{ color: "#F26D5F" }}>{research.err}</div>}
          {research.busy && <div className="mf-hint">Webを検索してまとめています。少し時間がかかります…</div>}
          {research.text && <div className="mf-research">{research.text}</div>}
          <div className="mf-hint" style={{ opacity: 0.7 }}>参考情報です。投資判断はご自身で。</div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   シミュレーション
   ============================================================ */
function SimPanel({ defaultIncome, defaultExpense }) {
  const [p, setP] = useState({
    income: defaultIncome || 350000,
    expense: defaultExpense || 250000,
    investRatio: 50,
    annualReturn: 4,
    years: 15,
    startCash: 0,
    startInvested: 0,
  });
  const set = (k) => (e) => setP({ ...p, [k]: Number(e.target.value) });

  const series = useMemo(() => {
    const run = (retPct) => {
      let cash = p.startCash, invested = p.startInvested;
      const pts = [{ cash, invested }];
      const mr = retPct / 100 / 12;
      for (let y = 1; y <= p.years; y++) {
        for (let m = 0; m < 12; m++) {
          const surplus = p.income - p.expense;
          const inv = Math.max(surplus, 0) * (p.investRatio / 100);
          invested = invested * (1 + mr) + inv;
          cash += surplus - inv;
        }
        pts.push({ cash, invested });
      }
      return pts;
    };
    const base = run(p.annualReturn);
    const hi = run(p.annualReturn + 2);
    const lo = run(Math.max(p.annualReturn - 2, 0));
    return base.map((b, i) => ({
      year: i === 0 ? "現在" : `${i}年後`,
      現金: Math.round(b.cash),
      投資資産: Math.round(b.invested),
      合計: Math.round(b.cash + b.invested),
      "楽観(+2%)": Math.round(hi[i].cash + hi[i].invested),
      "悲観(-2%)": Math.round(lo[i].cash + lo[i].invested),
    }));
  }, [p]);

  const final = series[series.length - 1];

  const fields = [
    ["月収（平均）", "income", 1, "円"],
    ["月支出（平均）", "expense", 1, "円"],
    ["余剰の投資割合", "investRatio", 1, "%"],
    ["想定年利", "annualReturn", 0.5, "%"],
    ["期間", "years", 1, "年"],
    ["現在の現金", "startCash", 1, "円"],
    ["現在の投資資産", "startInvested", 1, "円"],
  ];

  return (
    <div className="mf-panel">
      <div className="mf-simgrid">
        {fields.map(([label, k, step, suffix]) => (
          <label key={k} className="mf-simfield">
            <span>{label}</span>
            <span className="mf-row" style={{ gap: 6 }}>
              <input className="mf-input mf-mono" type="number" step={step} value={p[k]} onChange={set(k)} />
              <span className="mf-numsub">{suffix}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mf-simresult">
        {p.years}年後の想定資産: <b className="mf-mono" style={{ color: "#45C48F", fontSize: 20 }}>{fmt(final.合計)}</b>
        <span className="mf-numsub">（現金 {fmt(final.現金)} ＋ 投資 {fmt(final.投資資産)} ／ シナリオ幅 {fmt(final["悲観(-2%)"])} 〜 {fmt(final["楽観(+2%)"])}）</span>
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="year" stroke="#93A0AE" fontSize={11} />
            <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => (v / 10000).toLocaleString() + "万"} width={60} />
            <Tooltip contentStyle={TT} formatter={(v) => fmt(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="現金" stroke="#4C9AFF" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="投資資産" stroke="#8B7CF6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="合計" stroke="#45C48F" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="楽観(+2%)" stroke="#45C48F" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="悲観(-2%)" stroke="#F26D5F" strokeWidth={1} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mf-hint" style={{ opacity: 0.7 }}>複利は月次計算。年利や収支は将来を保証するものではありません。</div>
    </div>
  );
}

/* ============================================================
   小物
   ============================================================ */
const TT = { background: "#181E25", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#E7ECF2", fontSize: 12 };

function SectionHead({ no, title, sub }) {
  return (
    <div className="mf-sechead">
      <span className="mf-secno">{no}</span>
      <div>
        <h2 className="mf-sectitle">{title}</h2>
        <div className="mf-secsub">{sub}</div>
      </div>
    </div>
  );
}
function StatCard({ label, value, color, sub }) {
  return (
    <div className="mf-stat">
      <div className="mf-statlabel">{label}</div>
      <div className="mf-statvalue mf-mono" style={{ color }}>{value}</div>
      {sub && <div className="mf-statsub mf-mono">{sub}</div>}
    </div>
  );
}

function StyleTag() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@700;900&family=IBM+Plex+Sans+JP:wght@400;500;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
      .mf-root { min-height: 100vh; background: #101418; color: #E7ECF2; font-family: 'IBM Plex Sans JP', sans-serif; }
      .mf-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
      .mf-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding: 24px 20px 14px; max-width: 960px; margin: 0 auto; flex-wrap: wrap; }
      .mf-eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.28em; color: #F5A524; }
      .mf-title { font-family: 'Zen Old Mincho', serif; font-weight: 900; font-size: clamp(22px, 5vw, 32px); margin: 4px 0 0; line-height: 1.2; }
      .mf-monthnav { display: flex; align-items: center; gap: 10px; }
      .mf-headright { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
      .mf-profiletabs { display: flex; background: #181E25; border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 3px; gap: 2px; }
      .mf-ptab { background: transparent; color: #93A0AE; border: none; border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
      .mf-ptab.active { background: #F5A524; color: #16130A; }
      .mf-ptab:not(.active):hover { color: #F5A524; }
      .mf-pinbar { max-width: 960px; margin: 0 auto; padding: 8px 20px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; color: #C4CDD6; }
      .mf-ownerchip { flex: 0 0 auto; font-size: 11px; color: #101418; background: #93A0AE; border-radius: 999px; padding: 1px 8px; font-weight: 700; }
      .mf-quickwrap { max-width: 480px; margin: 0 auto; padding: 16px 16px 48px; }
      .mf-quickhead { display: flex; flex-direction: column; gap: 4px; margin: 16px 0 10px; }
      .mf-amount { font-size: 34px; text-align: right; padding: 12px 16px; font-weight: 600; }
      .mf-quicklabel { font-size: 11px; color: #93A0AE; letter-spacing: 0.1em; margin: 14px 0 6px; }
      .mf-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .mf-acctchips { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .mf-chipbtn { background: #181E25; border: 1px solid rgba(255,255,255,0.14); color: #C4CDD6; border-radius: 999px; padding: 8px 12px; font-size: 13px; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 6px; }
      .mf-chipbtn.on { border-color: #F5A524; color: #F5A524; background: rgba(245,165,36,0.08); }
      .mf-bigbtn { padding: 14px; font-size: 15px; border-radius: 12px; }
      .mf-modetabs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; background: #181E25; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 4px; margin-top: 12px; }
      .mf-modetab { background: transparent; color: #93A0AE; border: none; border-radius: 9px; padding: 10px 4px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; }
      .mf-modetab.active { background: #F5A524; color: #16130A; }
      .mf-modetab:not(.active):hover { color: #F5A524; }
      .mf-steplabel { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #E7ECF2; margin: 18px 0 8px; }
      .mf-stepnum { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: rgba(245,165,36,0.15); border: 1px solid #F5A524; color: #F5A524; font-size: 12px; font-family: 'IBM Plex Mono', monospace; }
      .mf-optbtn { display: block; width: 100%; text-align: left; background: transparent; border: none; color: #93A0AE; font-size: 13px; padding: 10px 0 4px; cursor: pointer; font-family: inherit; margin-top: 10px; }
      .mf-optbtn:hover { color: #F5A524; }
      .mf-photobox { width: 100%; padding: 34px 16px; margin-top: 4px; background: rgba(245,165,36,0.05); border: 1.5px dashed rgba(245,165,36,0.5); border-radius: 14px; color: #F5A524; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; }
      .mf-photobox:hover { background: rgba(245,165,36,0.1); }
      .mf-photobox:disabled { opacity: 0.5; cursor: wait; }
      .mf-calgrid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
      .mf-calhead { text-align: center; font-size: 11px; color: #93A0AE; padding: 4px 0 6px; }
      .mf-calhead.sun { color: #F26D5F; }
      .mf-calhead.sat { color: #4C9AFF; }
      .mf-calcell { min-height: 52px; background: #101418; border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; padding: 5px 6px; cursor: pointer; font-family: inherit; color: #E7ECF2; min-width: 0; }
      .mf-calcell:hover { border-color: #F5A524; }
      .mf-calcell.sel { outline: 2px solid #F5A524; outline-offset: -1px; }
      .mf-calcell.today .mf-calday { color: #F5A524; font-weight: 700; }
      .mf-calday { font-size: 11px; color: #93A0AE; line-height: 1; }
      .mf-calamt { font-size: 10.5px; align-self: flex-end; line-height: 1; overflow: hidden; max-width: 100%; text-overflow: ellipsis; white-space: nowrap; }
      @media (max-width: 480px) { .mf-calcell { min-height: 44px; padding: 4px 4px; } .mf-calamt { font-size: 9.5px; } }
      .mf-btn.quick { background: transparent; color: #F5A524; border-color: #F5A524; }
      .mf-menuwrap { position: relative; flex: 0 0 auto; }
      .mf-menubtn { background: #181E25; color: #F5A524; border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; width: 40px; height: 40px; font-size: 17px; cursor: pointer; }
      .mf-menubtn:hover { border-color: #F5A524; }
      .mf-drawer { position: absolute; top: 44px; left: 0; min-width: 220px; background: #181E25; border: 1px solid rgba(255,255,255,0.14); border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 2px; opacity: 0; visibility: hidden; transform: translateY(-4px); transition: opacity .15s ease, transform .15s ease, visibility .15s; z-index: 60; box-shadow: 0 14px 36px rgba(0,0,0,0.55); }
      .mf-menuwrap:hover .mf-drawer, .mf-menuwrap:focus-within .mf-drawer, .mf-drawer.open { opacity: 1; visibility: visible; transform: none; }
      .mf-drawitem { text-align: left; background: transparent; border: none; color: #C4CDD6; padding: 9px 12px; border-radius: 8px; font-size: 13.5px; cursor: pointer; font-family: inherit; }
      .mf-drawitem:hover { background: rgba(245,165,36,0.1); color: #F5A524; }
      .mf-drawitem.active { color: #F5A524; background: rgba(245,165,36,0.08); font-weight: 700; }
      .mf-drawsep { height: 1px; background: rgba(255,255,255,0.1); margin: 4px 6px; }
      .mf-statsub { font-size: 10.5px; color: #93A0AE; margin-top: 3px; }
      .mf-catbar { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
      .mf-catbarname { flex: 0 0 72px; font-size: 13px; }
      .mf-catbaramt { flex: 0 0 92px; text-align: right; font-size: 13px; }
      .mf-tabwrap { overflow-x: auto; }
      .mf-tabhead, .mf-tabrow { display: grid; grid-template-columns: 1.7fr 1fr 1fr 1fr 0.7fr 0.9fr; gap: 8px; align-items: center; min-width: 620px; padding: 7px 4px; font-size: 13px; }
      .mf-tabhead { color: #93A0AE; font-size: 11px; letter-spacing: 0.06em; border-bottom: 1px solid rgba(255,255,255,0.1); }
      .mf-tabrow { border-bottom: 1px solid rgba(255,255,255,0.05); }
      .mf-tabname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      @media (prefers-reduced-motion: reduce) { .mf-drawer { transition: none; } }
      .mf-fab { position: fixed; bottom: 18px; right: 18px; width: 54px; height: 54px; border-radius: 50%; background: #F5A524; color: #16130A; border: none; font-size: 22px; cursor: pointer; z-index: 90; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
      .mf-fab:hover { background: #FFB84D; }
      .mf-agent { position: fixed; bottom: 82px; right: 18px; width: min(360px, calc(100vw - 24px)); height: min(500px, 72vh); background: #181E25; border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; z-index: 89; display: flex; flex-direction: column; box-shadow: 0 18px 48px rgba(0,0,0,0.6); overflow: hidden; }
      .mf-agenthead { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 14px; font-weight: 700; font-family: 'Zen Old Mincho', serif; }
      .mf-agentbody { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
      .mf-agentintro { font-size: 13px; color: #C4CDD6; }
      .mf-abub { max-width: 88%; padding: 9px 12px; border-radius: 12px; font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
      .mf-abub.user { align-self: flex-end; background: rgba(245,165,36,0.15); border: 1px solid rgba(245,165,36,0.3); color: #E7ECF2; border-bottom-right-radius: 4px; }
      .mf-abub.ai { align-self: flex-start; background: #101418; border: 1px solid rgba(255,255,255,0.1); color: #E7ECF2; border-bottom-left-radius: 4px; }
      .mf-agentfoot { display: flex; gap: 6px; padding: 10px 12px 6px; border-top: 1px solid rgba(255,255,255,0.1); }
      .mf-agentnote { font-size: 10px; color: #6E7A87; padding: 0 12px 10px; }
      .mf-monthlabel { font-family: 'Zen Old Mincho', serif; font-size: 18px; font-weight: 700; min-width: 110px; text-align: center; }
      .mf-iconbtn { background: #181E25; color: #E7ECF2; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; width: 34px; height: 34px; font-size: 18px; cursor: pointer; }
      .mf-iconbtn:hover { border-color: #F5A524; }
      .mf-nav { position: sticky; top: 0; z-index: 20; background: rgba(16,20,24,0.92); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; gap: 6px; overflow-x: auto; padding: 8px 16px; -webkit-overflow-scrolling: touch; }
      .mf-navpill { flex: 0 0 auto; background: transparent; color: #93A0AE; border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer; white-space: nowrap; }
      .mf-navpill:hover { color: #F5A524; border-color: #F5A524; }
      .mf-main { max-width: 960px; margin: 0 auto; padding: 8px 16px 60px; }
      .mf-section { padding-top: 34px; scroll-margin-top: 56px; }
      .mf-sechead { display: flex; gap: 14px; align-items: baseline; margin-bottom: 14px; }
      .mf-secno { font-family: 'IBM Plex Mono', monospace; color: #F5A524; font-size: 13px; letter-spacing: 0.15em; }
      .mf-sectitle { font-family: 'Zen Old Mincho', serif; font-size: 22px; font-weight: 700; margin: 0; }
      .mf-secsub { color: #93A0AE; font-size: 12.5px; margin-top: 2px; }
      .mf-cards4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
      @media (max-width: 640px) { .mf-cards4 { grid-template-columns: repeat(2, 1fr); } }
      .mf-stat { background: #181E25; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; }
      .mf-statlabel { font-size: 11px; color: #93A0AE; letter-spacing: 0.08em; }
      .mf-statvalue { font-size: clamp(16px, 3.4vw, 22px); font-weight: 600; margin-top: 4px; }
      .mf-judgecard { margin-top: 12px; background: #181E25; border: 1px solid; border-left-width: 4px; border-radius: 12px; padding: 14px 16px; display: flex; gap: 14px; align-items: baseline; flex-wrap: wrap; }
      .mf-judgelabel { font-family: 'Zen Old Mincho', serif; font-size: 22px; font-weight: 900; }
      .mf-judgenote { color: #C4CDD6; font-size: 13.5px; }
      .mf-panel { background: #181E25; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; margin-top: 12px; }
      .mf-paneltitle { font-size: 13px; font-weight: 700; color: #C4CDD6; margin-bottom: 10px; letter-spacing: 0.04em; }
      .mf-flowwrap { overflow-x: auto; }
      .mf-flowwrap svg { min-width: 560px; }
      .mf-flowfoot { margin-top: 8px; font-size: 13px; color: #C4CDD6; }
      .mf-acctgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
      @media (max-width: 640px) { .mf-acctgrid { grid-template-columns: 1fr; } }
      .mf-acctcard { background: #181E25; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; }
      .mf-acctname { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; flex-wrap: wrap; }
      .mf-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
      .mf-chip { margin-left: auto; font-size: 11px; border: 1px solid; border-radius: 999px; padding: 2px 9px; }
      .mf-acctnums { margin-top: 8px; }
      .mf-num { font-family: 'IBM Plex Mono', monospace; font-size: 19px; font-weight: 600; }
      .mf-numsub { color: #93A0AE; font-size: 12px; }
      .mf-bar { height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; margin-top: 8px; overflow: hidden; }
      .mf-barfill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
      .mf-formgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
      .mf-input { background: #101418; color: #E7ECF2; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; padding: 9px 10px; font-size: 14px; font-family: inherit; min-width: 0; width: 100%; box-sizing: border-box; }
      .mf-input:focus { outline: 2px solid #F5A524; outline-offset: 1px; border-color: transparent; }
      select.mf-input option { background: #181E25; }
      .mf-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
      .mf-btn { border-radius: 8px; padding: 9px 16px; font-size: 13.5px; font-weight: 600; cursor: pointer; border: 1px solid transparent; font-family: inherit; }
      .mf-btn.primary { background: #F5A524; color: #16130A; }
      .mf-btn.primary:hover { background: #FFB84D; }
      .mf-btn.ghost { background: transparent; color: #E7ECF2; border-color: rgba(255,255,255,0.2); }
      .mf-btn.ghost:hover { border-color: #F5A524; color: #F5A524; }
      .mf-btn.danger { background: transparent; color: #F26D5F; border-color: #F26D5F; }
      .mf-btn:disabled { opacity: 0.5; cursor: wait; }
      .mf-del { background: transparent; color: #93A0AE; border: none; cursor: pointer; font-size: 14px; padding: 4px 8px; border-radius: 6px; }
      .mf-del:hover { color: #F26D5F; background: rgba(242,109,95,0.1); }
      .mf-hint { margin-top: 8px; font-size: 12.5px; color: #C4CDD6; }
      .mf-empty { color: #93A0AE; font-size: 13px; padding: 8px 0; }
      .mf-list { max-height: 340px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
      .mf-listrow { display: flex; align-items: center; gap: 8px; padding: 7px 4px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; }
      .mf-listdate { color: #93A0AE; flex: 0 0 42px; font-size: 12px; }
      .mf-listcat { flex: 0 0 auto; background: rgba(255,255,255,0.06); border-radius: 6px; padding: 2px 8px; font-size: 11.5px; }
      .mf-listmemo { flex: 1; color: #93A0AE; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
      .mf-listamt { flex: 0 0 auto; font-size: 13.5px; }
      .mf-twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      @media (max-width: 760px) { .mf-twocol { grid-template-columns: 1fr; } }
      .mf-research { margin-top: 10px; background: #101418; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; font-size: 13px; line-height: 1.8; white-space: pre-wrap; max-height: 360px; overflow-y: auto; }
      .mf-simgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
      .mf-simfield { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #93A0AE; }
      .mf-simresult { margin: 14px 0 10px; font-size: 14px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
      .mf-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); color: #6E7A87; font-size: 11.5px; text-align: center; }
      @media (prefers-reduced-motion: reduce) { .mf-barfill { transition: none; } }
    `}</style>
  );
}
