"use client";

import { useEffect, useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fmt } from "@/lib/judge";
import { businessDateJST } from "@/lib/date";
import { CAT_COLORS, CURRENCIES, categoriesForAccount } from "@/lib/constants";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import type { SplitEventOut, SplitEventDetailOut, CurrencyRateOut, SavingsActionOut } from "@/lib/apiTypes";
import { TT, fmtTooltip, MoneyViewToggle, ownerFilterName } from "../common";
import { useDashboard } from "../DashboardContext";
import AiSuggestButton from "../AiSuggestButton";
import RecurringExpenses from "./RecurringExpenses";

const SPLIT_RECENT_LIMIT = 5;

export default function ExpensePanel() {
  const { month, monthKey, allCats, refreshMonth, refreshSettings, me, ownerFilter } = useDashboard();
  const meName = me?.profile.name ?? "";
  const filterName = ownerFilterName(me, ownerFilter);
  const accounts = month?.aggregates.perAccount ?? [];
  const [entryMode, setEntryMode] = useState<"expense" | "income">("expense");
  const [form, setForm] = useState<{ date: string; account: string; category: string; amount: string; memo: string; sub: string }>({
    date: "",
    account: accounts[0]?.id ?? "a1",
    category: allCats[0] ?? "食費",
    amount: "",
    memo: "",
    sub: "",
  });
  const [incomeForm, setIncomeForm] = useState({ name: "", amount: "" });
  const [currency, setCurrency] = useState("JPY");
  const [showCustomCurrency, setShowCustomCurrency] = useState(false);
  const [foreignAmount, setForeignAmount] = useState("");
  const [rate, setRate] = useState<number | null>(null);
  const [rateErr, setRateErr] = useState("");
  const [ocrDiscountPercent, setOcrDiscountPercent] = useState<number | null>(null);
  const [ocrRedeemed, setOcrRedeemed] = useState<{ item: string; originalPrice: number } | null>(null);
  const [ocrGiftCard, setOcrGiftCard] = useState<{ item: string; amount: number } | null>(null);
  const [ocrItems, setOcrItems] = useState<{ name: string; price: number | null }[] | null>(null);
  const [redeemedBusy, setRedeemedBusy] = useState(false);
  const [giftCardBusy, setGiftCardBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [textIn, setTextIn] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [filterAcct, setFilterAcct] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ date: string; account_id: string; category: string; sub: string; amount: string; memo: string }>({
    date: "",
    account_id: "",
    category: "",
    sub: "",
    amount: "",
    memo: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const [splitEvents, setSplitEvents] = useState<SplitEventOut[] | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEvent, setLinkEvent] = useState<SplitEventOut | null>(null);
  const [linkDetail, setLinkDetail] = useState<SplitEventDetailOut | null>(null);
  const [linkBeneficiaryIds, setLinkBeneficiaryIds] = useState<string[]>([]);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEvent, setBulkEvent] = useState<SplitEventOut | null>(null);
  const [bulkDetail, setBulkDetail] = useState<SplitEventDetailOut | null>(null);
  const [bulkBeneficiaryIds, setBulkBeneficiaryIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  useEffect(() => {
    apiGet<{ events: SplitEventOut[] }>("/api/split-events")
      .then((r) => setSplitEvents(r.events))
      .catch(() => setSplitEvents([]));
  }, []);

  // 通貨を切り替えたら現在の為替レートを取得する（金額のプレビュー・登録額の根拠に使う）。
  // 固定の対応通貨リストは持たないため、3文字のコードが揃うたびにその場でAPIに問い合わせて対応可否を判定する。
  useEffect(() => {
    if (currency === "JPY" || currency.trim().length !== 3) return;
    let cancelled = false;
    apiGet<CurrencyRateOut>(`/api/currency/rate?currency=${currency}`)
      .then((r) => {
        if (!cancelled) setRate(r.rate);
      })
      .catch(() => {
        if (!cancelled) setRateErr("対応していない通貨か、為替レートの取得に失敗しました。コードを確認して時間をおいて再試行してください。");
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  if (!month) return null;

  const isForeign = currency !== "JPY" && currency.trim().length === 3;
  const jpyPreview = isForeign && rate && foreignAmount ? Math.round(Number(foreignAmount) * rate) : null;

  const catOptions = categoriesForAccount(allCats, form.account);

  const promoMsg = (promoted: string[]) => (promoted.length ? ` ✨「${promoted.join("、")}」を新カテゴリとして追加しました。` : "");

  const selectLinkEvent = async (ev: SplitEventOut) => {
    if (linkEvent?.id === ev.id) {
      setLinkEvent(null);
      setLinkDetail(null);
      setLinkBeneficiaryIds([]);
      return;
    }
    setLinkEvent(ev);
    setLinkDetail(null);
    try {
      const detail = await apiGet<SplitEventDetailOut>(`/api/split/${ev.share_token}`);
      setLinkDetail(detail);
      setLinkBeneficiaryIds(detail.participants.map((p) => p.id));
    } catch {
      setMsg("イベントの読み込みに失敗しました。");
    }
  };

  const toggleLinkBeneficiary = (id: string) => {
    setLinkBeneficiaryIds((ids) => (ids.includes(id) ? ids.filter((b) => b !== id) : [...ids, id]));
  };

  const addExpense = async () => {
    const amountToUse = isForeign ? jpyPreview : Number(form.amount);
    if (!amountToUse || amountToUse <= 0) {
      setMsg(isForeign ? "外貨の金額を入力してください。" : "金額を入力してください。");
      return;
    }
    if (isForeign && !rate) {
      setMsg(rateErr || "為替レートを取得中です。少し待ってから再試行してください。");
      return;
    }
    setBusy(true);
    try {
      const { promoted } = await apiPost<{ promoted: string[] }>("/api/expenses", {
        entries: [
          {
            date: form.date || undefined,
            account_id: form.account,
            category: form.category,
            amount: amountToUse,
            memo: form.memo,
            sub: form.category === "その他" ? form.sub.trim() : undefined,
            ...(isForeign ? { original_currency: currency, original_amount: Number(foreignAmount), exchange_rate: rate } : {}),
            ...(ocrItems && ocrItems.length > 0 ? { items: ocrItems } : {}),
          },
        ],
      });
      let splitNote = "";
      if (linkEvent && linkDetail && linkBeneficiaryIds.length > 0) {
        const payer = linkDetail.participants.find((p) => p.name === meName) ?? linkDetail.participants[0];
        if (payer) {
          try {
            await apiPost(`/api/split/${linkEvent.share_token}/expenses`, {
              payerId: payer.id,
              beneficiaryIds: linkBeneficiaryIds,
              amount: amountToUse,
              memo: form.memo,
              date: form.date || businessDateJST(),
            });
            splitNote = ` ／「${linkEvent.name}」にも登録`;
          } catch {
            splitNote = " ／ 割り勘への登録は失敗しました";
          }
        }
      }
      let discountNote = "";
      if (ocrDiscountPercent) {
        try {
          const { action: savingsRow } = await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", {
            item: form.memo.trim() || "購入品",
            discount_percent: ocrDiscountPercent,
            price_paid: amountToUse,
          });
          discountNote = ` ／ 節約履歴にも登録: ${savingsRow.emoji} ${savingsRow.title}（${fmt(savingsRow.estimated_saving)}節約）`;
        } catch {
          discountNote = " ／ 節約履歴への登録は失敗しました";
        }
      }
      if (ocrRedeemed) {
        try {
          const { action: savingsRow } = await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", {
            item: ocrRedeemed.item,
            original_price: ocrRedeemed.originalPrice,
            price_paid: 0,
          });
          discountNote += ` ／ ${savingsRow.emoji} ${savingsRow.title}（${fmt(savingsRow.estimated_saving)}節約、ポイント等で無料入手）も節約履歴に登録`;
        } catch {
          discountNote += " ／ ポイント等での無料入手の節約履歴登録は失敗しました";
        }
      }
      if (ocrGiftCard) {
        try {
          const { action: savingsRow } = await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", {
            item: ocrGiftCard.item,
            gift_card_amount: ocrGiftCard.amount,
          });
          discountNote += ` ／ ${savingsRow.emoji} ${savingsRow.title}（${fmt(savingsRow.estimated_saving)}節約、ギフトカードで支払い）も節約履歴に登録`;
        } catch {
          discountNote += " ／ ギフトカードでの節約履歴登録は失敗しました";
        }
      }
      setForm((f) => ({ ...f, amount: "", memo: "", sub: "" }));
      setForeignAmount("");
      setOcrDiscountPercent(null);
      setOcrRedeemed(null);
      setOcrGiftCard(null);
      setOcrItems(null);
      setMsg("✓ 追加しました。" + promoMsg(promoted) + splitNote + discountNote);
      refreshMonth();
      if (promoted.length) refreshSettings();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "追加に失敗しました。");
    }
    setBusy(false);
  };

  const addIncome = async () => {
    if (!incomeForm.amount || Number(incomeForm.amount) <= 0) {
      setMsg("金額を入力してください。");
      return;
    }
    setBusy(true);
    try {
      const next = [
        ...month.incomes.map((i) => ({ name: i.name, amount: i.amount, owner: i.owner })),
        { name: incomeForm.name.trim() || "収入", amount: Number(incomeForm.amount), owner: me?.profile.id ?? null },
      ];
      await apiPut(`/api/incomes?m=${monthKey}`, { incomes: next });
      setIncomeForm({ name: "", amount: "" });
      setMsg("✓ 収入を追加しました。");
      refreshMonth();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "追加に失敗しました。");
    }
    setBusy(false);
  };

  const runText = async () => {
    if (!textIn.trim() || textBusy) return;
    setTextBusy(true);
    setOcrDiscountPercent(null);
    setMsg("文章を解析中…");
    try {
      const { entries } = await apiPost<{
        entries: { date?: string; account?: string; category?: string; amount?: number; memo?: string; currency?: string }[];
      }>("/api/ai/parse-text", { text: textIn });
      const valid = entries.filter((p) => Number(p.amount) > 0);
      if (valid.length === 0) throw new Error("no entries");
      if (valid.length === 1) {
        const p = valid[0];
        const foreign = p.currency && p.currency.toUpperCase() !== "JPY" ? p.currency.toUpperCase() : null;
        setShowCustomCurrency(foreign ? !CURRENCIES.some((c) => c.code === foreign) : false);
        setCurrency(foreign ?? "JPY");
        if (foreign) setForeignAmount(String(p.amount ?? ""));
        setForm((f) => ({
          ...f,
          date: p.date || f.date,
          account: accounts.some((a) => a.id === p.account) ? (p.account as string) : f.account,
          amount: foreign ? "" : String(p.amount ?? f.amount),
          category: p.category && allCats.includes(p.category) ? p.category : f.category,
          memo: p.memo || f.memo,
        }));
        setMsg(
          foreign
            ? `解析成功: ${p.memo || ""} ${p.amount}${foreign}（${p.category}）。円換算を確認して「追加する」を押してください。`
            : `解析成功: ${p.memo || ""} ${fmt(p.amount || 0)}（${p.category}）。内容を確認して「追加する」を押してください。`
        );
      } else {
        const { promoted } = await apiPost<{ promoted: string[] }>("/api/expenses", {
          entries: valid.map((p) => {
            const foreign = p.currency && p.currency.toUpperCase() !== "JPY" ? p.currency.toUpperCase() : null;
            return {
              date: p.date,
              account_id: accounts.some((a) => a.id === p.account) ? p.account : accounts[0]?.id,
              category: p.category && allCats.includes(p.category) ? p.category : "その他",
              amount: Number(p.amount),
              memo: p.memo || "",
              ...(foreign ? { original_currency: foreign, original_amount: Number(p.amount) } : {}),
            };
          }),
        });
        setMsg(
          `${valid.length}件を追加しました: ${valid.map((p) => `${p.memo || p.category} ${p.currency && p.currency.toUpperCase() !== "JPY" ? `${p.amount}${p.currency.toUpperCase()}` : fmt(p.amount || 0)}`).join(" / ")}。明細から修正できます。` +
            promoMsg(promoted)
        );
        refreshMonth();
        if (promoted.length) refreshSettings();
      }
      setTextIn("");
    } catch {
      setMsg("文章の解析に失敗しました。手入力してください。");
    }
    setTextBusy(false);
  };

  const runOcr = async (file: File) => {
    setBusy(true);
    setOcrDiscountPercent(null);
    setOcrRedeemed(null);
    setOcrGiftCard(null);
    setOcrItems(null);
    setMsg("レシートを読み取り中…");
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/ai/ocr", { method: "POST", body: fd });
      if (!res.ok) throw new Error("failed");
      const parsed = (await res.json()) as {
        date: string | null;
        store: string;
        total: number;
        category: string;
        account?: string;
        currency?: string;
        discount_percent?: number | null;
        redeemed_item?: string | null;
        redeemed_original_price?: number | null;
        gift_card_amount?: number | null;
        items?: { name: string; price: number | null }[];
      };
      const foreign = parsed.currency && parsed.currency.toUpperCase() !== "JPY" ? parsed.currency.toUpperCase() : null;
      setShowCustomCurrency(foreign ? !CURRENCIES.some((c) => c.code === foreign) : false);
      setCurrency(foreign ?? "JPY");
      setForeignAmount(foreign ? String(parsed.total || "") : "");
      setOcrDiscountPercent(parsed.discount_percent && parsed.discount_percent > 0 && parsed.discount_percent < 100 ? parsed.discount_percent : null);
      const redeemed =
        parsed.redeemed_item && parsed.redeemed_original_price ? { item: parsed.redeemed_item, originalPrice: parsed.redeemed_original_price } : null;
      setOcrRedeemed(redeemed);
      setOcrItems(parsed.items && parsed.items.length > 0 ? parsed.items : null);
      // 総合計のうち、ギフトカード（eGift等）で充当された分は実支出ではないため、フォームの金額から差し引き、
      // 差し引いた分は追加時（または全額充当なら下の専用ボタンで）節約履歴に登録する（外貨は対象外）。
      const giftCard = !foreign && parsed.gift_card_amount && parsed.gift_card_amount > 0 ? Math.min(parsed.gift_card_amount, parsed.total || 0) : 0;
      setOcrGiftCard(giftCard > 0 ? { item: parsed.store || "購入品", amount: giftCard } : null);
      const chargeAmount = (parsed.total || 0) - giftCard;
      // ポイント等で全額相殺、またはギフトカードで全額充当され支払合計が0円のレシートは、
      // 支出として追加する金額が無いためフォームには反映しない（節約履歴への登録は下の専用ボタンで行う）。
      if (!(parsed.total > 0) || chargeAmount <= 0) {
        const notes: string[] = [];
        if (redeemed) notes.push(`🎁 ${redeemed.item}（定価${redeemed.originalPrice.toLocaleString()}円相当）をポイント等で無料入手したようです。`);
        if (giftCard > 0) notes.push(`🎁 ギフトカードで${giftCard.toLocaleString()}円分が支払われ、追加の支出は無いようです。`);
        setMsg(notes.length > 0 ? notes.join("") + "支出としては記録せず、下のボタンで節約履歴に登録できます。" : "レシートの金額を読み取れませんでした。手入力するか、別の写真で試してください。");
        setBusy(false);
        return;
      }
      setForm((f) => {
        const account = accounts.some((a) => a.id === parsed.account) ? (parsed.account as string) : f.account;
        const nextCats = categoriesForAccount(allCats, account);
        return {
          ...f,
          date: parsed.date || f.date,
          amount: foreign ? "" : String(chargeAmount || f.amount),
          account,
          category: nextCats.includes(parsed.category) ? parsed.category : nextCats.includes(f.category) ? f.category : nextCats[0] ?? f.category,
          memo: parsed.store || f.memo,
        };
      });
      const discountNote =
        parsed.discount_percent && parsed.discount_percent > 0 && parsed.discount_percent < 100
          ? `（${parsed.discount_percent}%オフを検出。追加時に節約アクションにも登録します）`
          : "";
      const redeemedNote = redeemed ? `（${redeemed.item}のポイント等での無料入手を検出。追加時に節約履歴にも登録します）` : "";
      const giftCardNote = giftCard > 0 ? `（ギフトカードで${giftCard.toLocaleString()}円分の充当を検出。追加時に節約履歴にも登録します）` : "";
      setMsg(
        (foreign
          ? `読み取り成功: ${parsed.store || "店名不明"} ${parsed.total}${foreign}。円換算を確認して追加してください。`
          : `読み取り成功: ${parsed.store || "店名不明"} ${fmt(parsed.total || 0)}。内容を確認して追加してください。`) +
          discountNote +
          redeemedNote +
          giftCardNote
      );
    } catch {
      setMsg("読み取りに失敗しました。手入力するか、別の写真で試してください。");
    }
    setBusy(false);
  };

  /** OCRでポイント等での無料入手を検出したが、支払合計が0円のため支出としては追加できない場合に、
   * 節約履歴にだけ単独で登録する。 */
  const registerRedeemedSaving = async () => {
    if (!ocrRedeemed || redeemedBusy) return;
    setRedeemedBusy(true);
    try {
      const { action: row } = await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", {
        item: ocrRedeemed.item,
        original_price: ocrRedeemed.originalPrice,
        price_paid: 0,
      });
      setMsg(`✓ 節約履歴に登録しました: ${row.emoji} ${row.title}（${fmt(row.estimated_saving)}節約）`);
      setOcrRedeemed(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    }
    setRedeemedBusy(false);
  };

  /** OCRでギフトカード（eGift等）による全額充当を検出したが、追加の支払いが無く支出としては
   * 追加できない場合に、節約履歴にだけ単独で登録する。 */
  const registerGiftCardSaving = async () => {
    if (!ocrGiftCard || giftCardBusy) return;
    setGiftCardBusy(true);
    try {
      const { action: row } = await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", {
        item: ocrGiftCard.item,
        gift_card_amount: ocrGiftCard.amount,
      });
      setMsg(`✓ 節約履歴に登録しました: ${row.emoji} ${row.title}（${fmt(row.estimated_saving)}節約）`);
      setOcrGiftCard(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    }
    setGiftCardBusy(false);
  };

  const sorted = [...month.expenses]
    .filter((e) => filterAcct === "all" || e.account_id === filterAcct)
    .filter((e) => !filterName || e.owner_name === filterName)
    .sort((a, b) => {
      const ad = a.masked ? "" : a.date;
      const bd = b.masked ? "" : b.date;
      return bd.localeCompare(ad);
    });
  const acctName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "—";
  const acctColor = (id: string) => accounts.find((a) => a.id === id)?.color ?? "#93A0AE";

  const deleteExpense = async (id: string) => {
    await apiDelete(`/api/expenses/${id}`);
    refreshMonth();
  };

  const startEdit = (e: { id: string; date: string; account_id: string; category: string; sub: string | null; amount: number; memo: string }) => {
    setEditingId(e.id);
    setEditForm({ date: e.date, account_id: e.account_id, category: e.category, sub: e.sub ?? "", amount: String(e.amount), memo: e.memo });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await apiPut(`/api/expenses/${editingId}`, {
      date: editForm.date,
      account_id: editForm.account_id,
      category: editForm.category,
      sub: editForm.category === "その他" ? editForm.sub.trim() : null,
      amount: Number(editForm.amount),
      memo: editForm.memo,
    });
    setEditingId(null);
    refreshMonth();
  };

  const toggleBulkMode = () => {
    setBulkMode((m) => !m);
    setBulkSelectedIds(new Set());
    setBulkEvent(null);
    setBulkDetail(null);
    setBulkBeneficiaryIds([]);
    setBulkMsg("");
  };

  const toggleBulkSelect = (id: string) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectBulkEvent = async (ev: SplitEventOut) => {
    if (bulkEvent?.id === ev.id) {
      setBulkEvent(null);
      setBulkDetail(null);
      setBulkBeneficiaryIds([]);
      return;
    }
    setBulkEvent(ev);
    setBulkDetail(null);
    try {
      const detail = await apiGet<SplitEventDetailOut>(`/api/split/${ev.share_token}`);
      setBulkDetail(detail);
      setBulkBeneficiaryIds(detail.participants.map((p) => p.id));
    } catch {
      setBulkMsg("イベントの読み込みに失敗しました。");
    }
  };

  const toggleBulkBeneficiary = (id: string) => {
    setBulkBeneficiaryIds((ids) => (ids.includes(id) ? ids.filter((b) => b !== id) : [...ids, id]));
  };

  /** 選択中の既存の支出（複数）を、選んだ割り勘イベントにまとめて登録する（1件ずつ複製登録）。
   * 支払った人はそれぞれの支出のowner_nameに対応する参加者にする（相手名義の支出も選べるため）。 */
  const registerBulkToSplit = async () => {
    if (!bulkEvent || !bulkDetail || bulkSelectedIds.size === 0 || bulkBeneficiaryIds.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    setBulkMsg("");
    const targets = month.expenses.filter(
      (e): e is Extract<typeof e, { masked: false }> => !e.masked && bulkSelectedIds.has(e.id)
    );
    let okCount = 0;
    let failCount = 0;
    for (const e of targets) {
      const payer = bulkDetail.participants.find((p) => p.name === e.owner_name) ?? bulkDetail.participants[0];
      if (!payer) {
        failCount++;
        continue;
      }
      try {
        await apiPost(`/api/split/${bulkEvent.share_token}/expenses`, {
          payerId: payer.id,
          beneficiaryIds: bulkBeneficiaryIds,
          amount: e.amount,
          memo: e.memo,
          date: e.date,
        });
        okCount++;
      } catch {
        failCount++;
      }
    }
    setBulkMsg(`✓「${bulkEvent.name}」に${okCount}件登録しました。` + (failCount > 0 ? `（${failCount}件失敗）` : ""));
    setBulkSelectedIds(new Set());
    setBulkBusy(false);
  };

  return (
    <>
      <div className="mf-panel">
        <div className="mf-paneltitle">{entryMode === "expense" ? "支出を追加" : "収入を追加"}</div>
        <div className="mf-chips" style={{ marginBottom: 10 }}>
          <button className={"mf-chipbtn" + (entryMode === "expense" ? " on" : "")} onClick={() => setEntryMode("expense")}>
            支出
          </button>
          <button className={"mf-chipbtn" + (entryMode === "income" ? " on" : "")} onClick={() => setEntryMode("income")}>
            収入
          </button>
        </div>

        {entryMode === "income" ? (
          <>
            <div className="mf-formgrid">
              <div>
                <label className="mf-fieldlabel" htmlFor="mf-inc-name">収入源</label>
                <input
                  id="mf-inc-name"
                  className="mf-input"
                  placeholder="例: 給与、副業"
                  value={incomeForm.name}
                  onChange={(e) => setIncomeForm({ ...incomeForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="mf-fieldlabel required" htmlFor="mf-inc-amount">金額（円）</label>
                <input
                  id="mf-inc-amount"
                  className="mf-input mf-mono"
                  type="number"
                  placeholder="例: 250000"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                />
              </div>
            </div>
            <div className="mf-hint" style={{ opacity: 0.6 }}>
              {monthKey.replace("-", "年")}月の収入として登録されます。今月の収入は「設定」からも編集できます。
            </div>
            <div className="mf-row" style={{ marginTop: 10 }}>
              <button className="mf-btn primary" disabled={busy} onClick={addIncome}>
                追加する
              </button>
            </div>
            {msg && <div className="mf-hint">{msg}</div>}
          </>
        ) : (
          <>
        <div className="mf-row" style={{ marginTop: 0, marginBottom: 10 }}>
          <input
            className="mf-input"
            style={{ flex: 1 }}
            placeholder="✍️ 文章で入力（例: コンビニで480円でおにぎりを買った）"
            value={textIn}
            onChange={(e) => setTextIn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runText();
            }}
          />
          <button className="mf-btn ghost" disabled={textBusy || !textIn.trim()} onClick={runText}>
            {textBusy ? "解析中…" : "解析"}
          </button>
        </div>
        <div className="mf-formgrid">
          <div>
            <label className="mf-fieldlabel" htmlFor="mf-exp-date">日付</label>
            <input id="mf-exp-date" className="mf-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="mf-fieldlabel" htmlFor="mf-exp-account">口座</label>
            <select
              id="mf-exp-account"
              className="mf-input"
              value={form.account}
              onChange={(e) => {
                const nextCats = categoriesForAccount(allCats, e.target.value);
                setForm((f) => ({ ...f, account: e.target.value, category: nextCats.includes(f.category) ? f.category : nextCats[0] ?? "" }));
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mf-fieldlabel required" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>カテゴリ</span>
              <AiSuggestButton text={form.memo} options={catOptions} onSuggest={(c) => setForm((f) => ({ ...f, category: c }))} />
            </div>
            <select className="mf-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {catOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mf-fieldlabel" htmlFor="mf-exp-currency">通貨</label>
            <select
              id="mf-exp-currency"
              className="mf-input"
              value={showCustomCurrency ? "__other__" : currency}
              onChange={(e) => {
                setRate(null);
                setRateErr("");
                if (e.target.value === "__other__") {
                  setShowCustomCurrency(true);
                  setCurrency("");
                } else {
                  setShowCustomCurrency(false);
                  setCurrency(e.target.value);
                }
              }}
            >
              <option value="JPY">円（JPY）</option>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}（{c.code}）
                </option>
              ))}
              <option value="__other__">その他（通貨コードを直接入力）</option>
            </select>
            {showCustomCurrency && (
              <input
                className="mf-input mf-mono"
                style={{ marginTop: 6 }}
                placeholder="通貨コード（例: VND）"
                maxLength={3}
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""));
                  setRate(null);
                  setRateErr("");
                }}
              />
            )}
          </div>
          {isForeign ? (
            <div>
              <label className="mf-fieldlabel required" htmlFor="mf-exp-famount">
                金額（{currency}）
              </label>
              <input
                id="mf-exp-famount"
                className="mf-input mf-mono"
                type="number"
                placeholder="例: 42.50"
                value={foreignAmount}
                onChange={(e) => setForeignAmount(e.target.value)}
              />
              <div className="mf-hint" style={{ margin: "4px 0 0" }}>
                {rateErr
                  ? rateErr
                  : rate
                    ? `1 ${currency} = ${rate.toFixed(2)}円 ／ ${jpyPreview !== null ? `≈ ${fmt(jpyPreview)}` : "金額を入力すると円換算を表示"}`
                    : "為替レートを取得中…"}
              </div>
            </div>
          ) : (
            <div>
              <label className="mf-fieldlabel required" htmlFor="mf-exp-amount">金額（円）</label>
              <input id="mf-exp-amount" className="mf-input mf-mono" type="number" placeholder="例: 480" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          )}
          <div>
            <label className="mf-fieldlabel" htmlFor="mf-exp-memo">メモ（任意）</label>
            <input id="mf-exp-memo" className="mf-input" placeholder="例: コンビニ" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
          </div>
        </div>
        {form.category === "その他" && (
          <div style={{ marginTop: 8 }}>
            <input className="mf-input" placeholder="その他の内容（例: サウナ）" value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} />
            <div className="mf-hint" style={{ opacity: 0.7 }}>
              同じ内容を3回入力すると、自動で新しいカテゴリになります。
            </div>
          </div>
        )}
        <div className="mf-hint" style={{ opacity: 0.6 }}>
          日付を空にすると当日（{businessDateJST()}、午前3:30より前は前日）の日付で登録されます。
        </div>

        {splitEvents && splitEvents.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button className="mf-optbtn" onClick={() => setLinkOpen((o) => !o)}>
              {linkOpen ? "▾" : "▸"} 🧳{linkEvent ? `「${linkEvent.name}」にも登録` : "割り勘にも登録"} — 任意
            </button>
            {linkOpen && (
              <>
                <div className="mf-chips" style={{ marginTop: 6 }}>
                  {splitEvents.slice(0, SPLIT_RECENT_LIMIT).map((ev) => (
                    <button key={ev.id} className={"mf-chipbtn" + (linkEvent?.id === ev.id ? " on" : "")} onClick={() => selectLinkEvent(ev)}>
                      {ev.name}
                    </button>
                  ))}
                </div>
                {linkEvent && linkDetail && linkDetail.participants.length > 0 && (
                  <>
                    <div className="mf-hint" style={{ margin: "8px 0 4px" }}>
                      誰のための支出か
                    </div>
                    <div className="mf-chips" style={{ marginTop: 0 }}>
                      {linkDetail.participants.map((p) => (
                        <button
                          key={p.id}
                          className={"mf-chipbtn" + (linkBeneficiaryIds.includes(p.id) ? " on" : "")}
                          onClick={() => toggleLinkBeneficiary(p.id)}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" disabled={busy || (!!linkEvent && !linkDetail)} onClick={addExpense}>
            {linkEvent && !linkDetail ? "割り勘イベントを読み込み中…" : "追加する"}
          </button>
          <button className="mf-btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "処理中…" : "📷 レシートから読み取る"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) runOcr(f);
              e.target.value = "";
            }}
          />
        </div>
        {ocrRedeemed && (
          <div className="mf-row" style={{ marginTop: 8 }}>
            <button className="mf-btn primary" disabled={redeemedBusy} onClick={registerRedeemedSaving}>
              {redeemedBusy ? "登録中…" : `🎁 ${ocrRedeemed.item}を節約として登録する（支出には追加しない）`}
            </button>
          </div>
        )}
        {ocrGiftCard && !form.amount && (
          <div className="mf-row" style={{ marginTop: 8 }}>
            <button className="mf-btn primary" disabled={giftCardBusy} onClick={registerGiftCardSaving}>
              {giftCardBusy ? "登録中…" : `🎁 ${ocrGiftCard.item}のギフトカード${ocrGiftCard.amount.toLocaleString()}円分を節約として登録する（支出には追加しない）`}
            </button>
          </div>
        )}
        {msg && <div className="mf-hint">{msg}</div>}
          </>
        )}
      </div>

      <RecurringExpenses />

      {month.aggregates.perCategory.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">カテゴリ別内訳</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={month.aggregates.perCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {month.aggregates.perCategory.map((c, i) => (
                    <Cell key={c.name} fill={CAT_COLORS[i % CAT_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={TT} formatter={fmtTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mf-hint" style={{ opacity: 0.7 }}>
            第3口座の相手の入力は金額非公開のため、この内訳には含まれません。
          </div>
        </div>
      )}

      <MoneyViewToggle />
      <div className="mf-panel">
        <div className="mf-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="mf-paneltitle" style={{ margin: 0 }}>
            明細（{sorted.length}件）
          </div>
          {splitEvents && splitEvents.length > 0 && (
            <button className="mf-btn ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={toggleBulkMode}>
              {bulkMode ? "✕ 選択をやめる" : "🧳 選択して割り勘に追加"}
            </button>
          )}
        </div>
        <div className="mf-chips" style={{ margin: "8px 0" }}>
          <button className={"mf-chipbtn" + (filterAcct === "all" ? " on" : "")} onClick={() => setFilterAcct("all")}>
            全て
          </button>
          {accounts.map((a) => (
            <button key={a.id} className={"mf-chipbtn" + (filterAcct === a.id ? " on" : "")} onClick={() => setFilterAcct(a.id)}>
              <span className="mf-dot" style={{ background: a.color }} />
              {a.name.replace(/（.*）/, "")}
            </button>
          ))}
        </div>

        {bulkMode && (
          <div className="mf-panel" style={{ margin: "0 0 10px", background: "#181E25" }}>
            <div className="mf-hint" style={{ margin: 0 }}>
              {bulkSelectedIds.size}件選択中（明細の左側のチェックボックスで選択）
            </div>
            {splitEvents && (
              <div className="mf-chips" style={{ marginTop: 8 }}>
                {splitEvents.slice(0, SPLIT_RECENT_LIMIT).map((ev) => (
                  <button key={ev.id} className={"mf-chipbtn" + (bulkEvent?.id === ev.id ? " on" : "")} onClick={() => selectBulkEvent(ev)}>
                    {ev.name}
                  </button>
                ))}
              </div>
            )}
            {bulkEvent && bulkDetail && bulkDetail.participants.length > 0 && (
              <>
                <div className="mf-hint" style={{ margin: "8px 0 4px" }}>
                  誰のための支出か
                </div>
                <div className="mf-chips" style={{ marginTop: 0 }}>
                  {bulkDetail.participants.map((p) => (
                    <button
                      key={p.id}
                      className={"mf-chipbtn" + (bulkBeneficiaryIds.includes(p.id) ? " on" : "")}
                      onClick={() => toggleBulkBeneficiary(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="mf-row" style={{ marginTop: 8 }}>
              <button
                className="mf-btn primary"
                disabled={bulkBusy || !bulkEvent || !bulkDetail || bulkSelectedIds.size === 0 || bulkBeneficiaryIds.length === 0}
                onClick={registerBulkToSplit}
              >
                {bulkEvent && !bulkDetail ? "読み込み中…" : `選択した${bulkSelectedIds.size}件を登録する`}
              </button>
            </div>
            {bulkMsg && <div className="mf-hint">{bulkMsg}</div>}
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="mf-empty">まだ支出がありません。上のフォームかレシート写真から追加できます。</div>
        ) : (
          <div className="mf-list">
            {sorted.map((e) => {
              if (e.masked) {
                return (
                  <div key={e.id} className="mf-listrow" style={{ opacity: 0.75 }}>
                    <span className="mf-mono mf-listdate">—</span>
                    <span className="mf-dot" style={{ background: acctColor(e.account_id) }} title={acctName(e.account_id)} />
                    <span className="mf-listcat">{e.category}</span>
                    {e.owner_name !== meName && <span className="mf-ownerchip">{e.owner_name}</span>}
                    <span className="mf-listmemo">🔒 非公開</span>
                    <span className="mf-mono mf-listamt">¥•••••</span>
                    <span className="mf-del" style={{ cursor: "default", opacity: 0.3 }} title="相手の記録は削除できません">
                      ·
                    </span>
                  </div>
                );
              }
              if (editingId === e.id) {
                return (
                  <div key={e.id} className="mf-formgrid" style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <input className="mf-input" type="date" value={editForm.date} onChange={(ev) => setEditForm((f) => ({ ...f, date: ev.target.value }))} />
                    <div className="mf-chips">
                      {accounts.map((a) => (
                        <button
                          key={a.id}
                          className={"mf-chipbtn" + (editForm.account_id === a.id ? " on" : "")}
                          onClick={() => {
                            const nextCats = categoriesForAccount(allCats, a.id);
                            setEditForm((f) => ({ ...f, account_id: a.id, category: nextCats.includes(f.category) ? f.category : nextCats[0] ?? "" }));
                          }}
                        >
                          {a.name.replace(/（.*）/, "")}
                        </button>
                      ))}
                    </div>
                    <div className="mf-chips">
                      {categoriesForAccount(allCats, editForm.account_id).map((c) => (
                        <button key={c} className={"mf-chipbtn" + (editForm.category === c ? " on" : "")} onClick={() => setEditForm((f) => ({ ...f, category: c }))}>
                          {c}
                        </button>
                      ))}
                    </div>
                    {editForm.category === "その他" && (
                      <input
                        className="mf-input"
                        placeholder="その他の内容"
                        value={editForm.sub}
                        onChange={(ev) => setEditForm((f) => ({ ...f, sub: ev.target.value }))}
                      />
                    )}
                    <input
                      className="mf-input mf-mono"
                      type="number"
                      placeholder="金額"
                      value={editForm.amount}
                      onChange={(ev) => setEditForm((f) => ({ ...f, amount: ev.target.value }))}
                    />
                    <input className="mf-input" placeholder="メモ" value={editForm.memo} onChange={(ev) => setEditForm((f) => ({ ...f, memo: ev.target.value }))} />
                    <div className="mf-row">
                      <button className="mf-btn primary" onClick={saveEdit}>
                        保存
                      </button>
                      <button className="mf-btn ghost" onClick={() => setEditingId(null)}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={e.id} className="mf-listrow">
                  {bulkMode && (
                    <input
                      type="checkbox"
                      checked={bulkSelectedIds.has(e.id)}
                      onChange={() => toggleBulkSelect(e.id)}
                      style={{ marginRight: 2 }}
                    />
                  )}
                  <span className="mf-mono mf-listdate">{e.date.slice(5)}</span>
                  <span className="mf-dot" style={{ background: acctColor(e.account_id) }} title={acctName(e.account_id)} />
                  <span className="mf-listcat">
                    {e.category}
                    {e.sub ? `（${e.sub}）` : ""}
                  </span>
                  {e.owner_name !== meName && <span className="mf-ownerchip">{e.owner_name}</span>}
                  <span className="mf-listmemo">{e.memo}</span>
                  <span className="mf-mono mf-listamt">
                    {fmt(e.amount)}
                    {e.original_currency && (
                      <span style={{ display: "block", fontSize: 10, color: "#6B7684", fontWeight: 400 }}>
                        {e.original_amount} {e.original_currency}
                      </span>
                    )}
                  </span>
                  <button className="mf-btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => startEdit(e)}>
                    編集
                  </button>
                  <button className="mf-del" onClick={() => deleteExpense(e.id)}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
