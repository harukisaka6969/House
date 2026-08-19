"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import type { PersonOut, JournalEncounterOut } from "@/lib/apiTypes";
import { SectionHead } from "../common";

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${y}/${m}/${day}`;
}

function matches(p: PersonOut, q: string): boolean {
  const needle = q.toLowerCase();
  if (p.canonical_name.toLowerCase().includes(needle)) return true;
  return p.aliases.some((a) => a.alias.toLowerCase().includes(needle));
}

/** 日記に登場した人物ごとに「最後に会ったのはいつ・何をしたか」を振り返るための一覧・検索。
 * 表記ゆれ（本名・ニックネーム）を登録しておくと、日記からの人物抽出（Journalの「🧑 人物を抽出」）が
 * その表記を拾えるようになる。vCardの一括取り込みにも対応。 */
export default function People() {
  const [people, setPeople] = useState<PersonOut[] | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JournalEncounterOut[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    apiGet<{ people: PersonOut[] }>("/api/people")
      .then((r) => setPeople(r.people))
      .catch(() => setPeople([]));
  };
  useEffect(load, []);

  const visible = useMemo(() => {
    if (!people) return [];
    const q = query.trim();
    const base = q ? people.filter((p) => matches(p, q)) : people.filter((p) => p.encounter_count > 0);
    return [...base].sort((a, b) => {
      if (a.last_date && b.last_date) return b.last_date.localeCompare(a.last_date);
      if (a.last_date) return -1;
      if (b.last_date) return 1;
      return a.canonical_name.localeCompare(b.canonical_name, "ja");
    });
  }, [people, query]);

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    apiGet<{ encounters: JournalEncounterOut[] }>(`/api/people/${id}/encounters`)
      .then((r) => setDetail(r.encounters))
      .catch(() => setDetail([]));
  };

  const submitNewPerson = async () => {
    if (!newName.trim() || addBusy) return;
    setAddBusy(true);
    try {
      const aliases = newAliases
        .split(/[、,]/)
        .map((a) => a.trim())
        .filter(Boolean);
      const { failedAliases } = await apiPost<{ person: PersonOut; failedAliases: string[] }>("/api/people", {
        canonical_name: newName.trim(),
        aliases,
      });
      setNewName("");
      setNewAliases("");
      setShowAddForm(false);
      setMsg(failedAliases.length > 0 ? `✓ 登録しました（「${failedAliases.join("、")}」は既に別の人物に登録済みのためスキップしました）。` : "✓ 登録しました。");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    }
    setAddBusy(false);
  };

  const submitAlias = async (personId: string) => {
    const alias = (aliasDraft[personId] ?? "").trim();
    if (!alias) return;
    try {
      await apiPost(`/api/people/${personId}/aliases`, { alias });
      setAliasDraft((d) => ({ ...d, [personId]: "" }));
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "表記ゆれの登録に失敗しました。");
    }
  };

  const removeAlias = async (personId: string, aliasId: string) => {
    await apiDelete(`/api/people/${personId}/aliases/${aliasId}`);
    load();
  };

  const removePerson = async (personId: string) => {
    if (expandedId === personId) {
      setExpandedId(null);
      setDetail(null);
    }
    await apiDelete(`/api/people/${personId}`);
    load();
  };

  const importVCard = async (file: File) => {
    setImportBusy(true);
    setMsg("連絡先を読み込み中…");
    try {
      const text = await file.text();
      const r = await apiPost<{ peopleCreated: number; aliasesCreated: number; aliasesSkipped: number }>("/api/people/import-vcard", { vcard: text });
      setMsg(`✓ ${r.peopleCreated}人を取り込みました（表記ゆれ${r.aliasesCreated}件登録${r.aliasesSkipped > 0 ? `、${r.aliasesSkipped}件は既存表記と重複のためスキップ` : ""}）。`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "取り込みに失敗しました。");
    }
    setImportBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (!people) return <div className="mf-empty">読み込み中…</div>;

  return (
    <section className="mf-section">
      <SectionHead
        no="28"
        title="知人"
        sub="日記に登場した人物ごとに、最後に会った日・何をしたかを振り返れます。表記ゆれ（本名・ニックネーム）を登録しておくと、日記からの人物抽出の精度が上がります。"
      />

      <div className="mf-panel">
        <input
          className="mf-input"
          placeholder="🔍 人物を名前・ニックネームで検索（空欄なら最近会った人だけ表示）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {msg && <div className="mf-hint">{msg}</div>}

        {visible.length === 0 ? (
          <div className="mf-empty" style={{ marginTop: 10 }}>
            {query.trim() ? "見つかりませんでした。" : "まだ日記から会った記録がありません。日記の「🧑 人物を抽出」を使うか、下の「＋ 人物を登録」で追加できます。"}
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map((p) => (
              <div key={p.id} className="mf-panel" style={{ margin: 0, background: "#101418" }}>
                <button
                  onClick={() => toggleExpand(p.id)}
                  style={{ width: "100%", background: "none", border: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", padding: 0 }}
                >
                  <div className="mf-row" style={{ justifyContent: "space-between" }}>
                    <b>{p.canonical_name}</b>
                    <span className="mf-hint" style={{ margin: 0 }}>{expandedId === p.id ? "▾ 閉じる" : "▸ 詳細"}</span>
                  </div>
                  <div className="mf-hint" style={{ margin: "4px 0 0" }}>
                    {p.last_date ? `最後に会ったのは ${fmtDate(p.last_date)}${p.last_summary ? ` ／ ${p.last_summary}` : ""}（計${p.encounter_count}回）` : "まだ会った記録がありません"}
                  </div>
                </button>

                {expandedId === p.id && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="mf-chips" style={{ marginTop: 0 }}>
                      {p.aliases.map((a) => (
                        <span key={a.id} className="mf-chipbtn on" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {a.alias}
                          <button className="mf-del" style={{ padding: 0 }} onClick={() => removeAlias(p.id, a.id)}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="mf-row" style={{ marginTop: 6 }}>
                      <input
                        className="mf-input"
                        placeholder="表記ゆれを追加（例: おくちゃん）"
                        value={aliasDraft[p.id] ?? ""}
                        onChange={(e) => setAliasDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                        style={{ flex: 1 }}
                      />
                      <button className="mf-btn ghost" onClick={() => submitAlias(p.id)}>
                        追加
                      </button>
                    </div>

                    <div className="mf-hint" style={{ margin: "10px 0 4px" }}>会った記録</div>
                    {detail === null ? (
                      <div className="mf-hint" style={{ margin: 0 }}>読み込み中…</div>
                    ) : detail.length === 0 ? (
                      <div className="mf-hint" style={{ margin: 0 }}>記録はまだありません。</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {detail.map((e) => (
                          <div key={e.id} className="mf-row" style={{ justifyContent: "space-between", gap: 8 }}>
                            <span className="mf-mono">{fmtDate(e.date)}</span>
                            <span style={{ flex: 1 }}>{e.summary || "（内容の記録なし）"}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <button className="mf-btn ghost" style={{ marginTop: 10, color: "#F26D5F" }} onClick={() => removePerson(p.id)}>
                      この人物を削除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">人物を登録</div>
        {!showAddForm ? (
          <button className="mf-btn primary" onClick={() => setShowAddForm(true)}>
            ＋ 人物を登録
          </button>
        ) : (
          <div className="mf-formgrid">
            <input className="mf-input" placeholder="名前（例: 奥田）" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input
              className="mf-input"
              placeholder="表記ゆれ（任意・読点区切り。例: おくちゃん、奥田さん）"
              value={newAliases}
              onChange={(e) => setNewAliases(e.target.value)}
            />
            <div className="mf-row">
              <button className="mf-btn primary" disabled={!newName.trim() || addBusy} onClick={submitNewPerson}>
                {addBusy ? "登録中…" : "登録する"}
              </button>
              <button
                className="mf-btn ghost"
                onClick={() => {
                  setShowAddForm(false);
                  setNewName("");
                  setNewAliases("");
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        <div className="mf-hint" style={{ marginTop: 14, opacity: 0.7 }}>
          iPhoneの連絡先アプリで「書き出し」からvCard(.vcf)を作成してアップロードすると、氏名とニックネームを一括で表記ゆれとして登録できます。
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".vcf,text/vcard,text/x-vcard"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importVCard(f);
          }}
        />
        <button className="mf-btn ghost" style={{ marginTop: 8 }} disabled={importBusy} onClick={() => fileRef.current?.click()}>
          {importBusy ? "取り込み中…" : "📇 連絡先(vCard)を取り込む"}
        </button>
      </div>
    </section>
  );
}
