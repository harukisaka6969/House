"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import type { SavingsActionOut } from "@/lib/apiTypes";
import { SectionHead, StatCard } from "../common";

export default function SavingsActions() {
  const [actions, setActions] = useState<SavingsActionOut[] | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");

  const load = () => {
    apiGet<{ actions: SavingsActionOut[] }>("/api/savings-actions")
      .then((r) => setActions(r.actions))
      .catch(() => setActions([]));
  };
  useEffect(load, []);

  const totalSaving = useMemo(() => (actions ?? []).reduce((s, a) => s + a.estimated_saving, 0), [actions]);

  const filtered = useMemo(() => {
    if (!actions) return [];
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) =>
      [a.title, a.description, a.reasoning, ...a.keywords].some((s) => s.toLowerCase().includes(q))
    );
  }, [actions, query]);

  if (!actions) return <div className="mf-empty">読み込み中…</div>;

  const submit = async () => {
    const text = description.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setMsg("");
    try {
      const res = await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", { description: text });
      setActions((prev) => [res.action, ...(prev ?? [])]);
      setDescription("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/savings-actions/${id}`);
    setActions((prev) => (prev ?? []).filter((a) => a.id !== id));
  };

  return (
    <section className="mf-section">
      <SectionHead
        no="25"
        title="節約アクション"
        sub="工夫して支出を抑えた行動を書くと、AIが経済効果を見積もってカードにします。キーワードで後から検索できます。"
      />

      <div className="mf-cards4">
        <StatCard label="登録件数" value={`${actions.length}件`} color="#E7ECF2" />
        <StatCard label="累計節約額（推定）" value={fmt(totalSaving)} color="#45C48F" />
      </div>

      <div className="mf-panel">
        <label className="mf-fieldlabel" htmlFor="sv-desc">
          今日の行動
        </label>
        <textarea
          id="sv-desc"
          className="mf-input"
          rows={3}
          placeholder="例: ブルガリアヨーグルトを買う代わりに自家培養ヨーグルトを1.1キロ作った / お金の代わりに楽天ポイントを800円分使った"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" onClick={submit} disabled={submitting || !description.trim()}>
            {submitting ? "AIが計算中…" : "登録する"}
          </button>
        </div>
        {msg && <div className="mf-hint">{msg}</div>}
      </div>

      <div className="mf-formgrid" style={{ marginBottom: 4 }}>
        <input
          className="mf-input"
          placeholder="🔍 キーワードで検索（例: ヨーグルト、ポイント）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mf-empty">{actions.length === 0 ? "まだ登録がありません。" : "該当するカードがありません。"}</div>
      ) : (
        <div className="sv-cards">
          {filtered.map((a) => (
            <div key={a.id} className="sv-card">
              <div className="sv-cardtop">
                <span className="sv-cardtitle">{a.title}</span>
                <span className="sv-cardamount">{fmt(a.estimated_saving)}</span>
              </div>
              <div className="sv-cardmeta">
                {a.date} ・ {a.owner_name}
              </div>
              <div className="sv-carddesc">{a.description}</div>
              <div className="sv-cardreason">{a.reasoning}</div>
              {a.keywords.length > 0 && (
                <div className="mf-chips" style={{ marginTop: 8 }}>
                  {a.keywords.map((k) => (
                    <button key={k} className="mf-chipbtn" style={{ cursor: "pointer" }} onClick={() => setQuery(k)}>
                      {k}
                    </button>
                  ))}
                </div>
              )}
              <button className="mf-del" style={{ marginTop: 8 }} onClick={() => remove(a.id)}>
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
