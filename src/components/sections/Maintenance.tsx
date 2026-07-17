"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/lib/judge";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { AssetOut, MaintenanceTaskOut, MaintenanceLogOut } from "@/lib/apiTypes";
import { MAINTENANCE_TEMPLATES, ASSET_KINDS } from "@/lib/constants";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";
import { todayStrJST } from "@/lib/date";

type UpcomingResponse = {
  assets: AssetOut[];
  allTasks: (MaintenanceTaskOut & { asset_name: string })[];
  upcoming: (MaintenanceTaskOut & { asset_name: string })[];
  recentLogs: (MaintenanceLogOut & { asset_id: string })[];
  monthly: { month: string; cost: number }[];
  totalCost: number;
};

const emptyTaskForm = { asset_id: "", name: "", interval_months: "", est_cost: "", next_due: "", memo: "", visible_to_family: true };
const emptyAssetForm = { name: "", kind: "car", acquired_date: "", memo: "" };

export default function Maintenance() {
  const { settings } = useDashboard();
  const [data, setData] = useState<UpcomingResponse | null>(null);
  const [view, setView] = useState<"upcoming" | "byAsset">("upcoming");
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [assetForm, setAssetForm] = useState(emptyAssetForm);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeForm, setCompleteForm] = useState({ done_date: todayStrJST(), actual_cost: "", memo: "", createExpense: false, account: "", category: "" });

  const load = () => {
    apiGet<UpcomingResponse>("/api/maintenance/upcoming?months=12").then(setData).catch(() => {});
  };
  useEffect(load, []);

  const today = todayStrJST();
  const in30 = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 30)).toISOString().slice(0, 10);
  }, [today]);

  if (!data) return <div className="mf-empty">読み込み中…</div>;

  const accounts = settings?.accounts ?? [];
  const allCats = settings?.customCategories ?? [];

  const monthlyGrouped = data.monthly.map((mb) => ({
    ...mb,
    tasks: data.upcoming.filter((t) => t.next_due.slice(0, 7) === mb.month),
  }));

  const submitTask = async () => {
    if (!taskForm.asset_id || !taskForm.name.trim() || !taskForm.next_due) return;
    await apiPost("/api/maintenance-tasks", {
      asset_id: taskForm.asset_id,
      name: taskForm.name.trim(),
      interval_months: taskForm.interval_months ? Number(taskForm.interval_months) : null,
      est_cost: Number(taskForm.est_cost) || 0,
      next_due: taskForm.next_due,
      memo: taskForm.memo,
      visible_to_family: taskForm.visible_to_family,
    });
    setTaskForm(emptyTaskForm);
    setShowTaskForm(false);
    load();
  };

  const applyTemplate = (t: { name: string; intervalMonths: number | null; estCost: number }) => {
    setTaskForm({ ...taskForm, name: t.name, interval_months: t.intervalMonths ? String(t.intervalMonths) : "", est_cost: String(t.estCost) });
  };

  const submitAsset = async () => {
    if (!assetForm.name.trim()) return;
    const res = await apiPost<{ asset: AssetOut }>("/api/assets", assetForm);
    setAssetForm(emptyAssetForm);
    setShowAssetForm(false);
    setTaskForm({ ...taskForm, asset_id: res.asset.id });
    load();
  };

  const deleteTask = async (id: string) => {
    await apiDelete(`/api/maintenance-tasks/${id}`);
    load();
  };

  const submitComplete = async (id: string) => {
    if (!completeForm.actual_cost) return;
    await apiPost(`/api/maintenance-tasks/${id}/complete`, {
      done_date: completeForm.done_date,
      actual_cost: Number(completeForm.actual_cost),
      memo: completeForm.memo,
      createExpense: completeForm.createExpense,
      account: completeForm.createExpense ? completeForm.account : undefined,
      category: completeForm.createExpense ? completeForm.category : undefined,
    });
    setCompletingId(null);
    setCompleteForm({ done_date: todayStrJST(), actual_cost: "", memo: "", createExpense: false, account: "", category: "" });
    load();
  };

  const badgeFor = (nextDue: string) => {
    if (nextDue < today) return <span className="mf-badge bad">期限超過</span>;
    if (nextDue <= in30) return <span className="mf-badge warn">まもなく</span>;
    return null;
  };

  const asset = selectedAsset ? data.assets.find((a) => a.id === selectedAsset) : null;
  const assetTasks = asset ? data.allTasks.filter((t) => t.asset_id === asset.id) : [];
  const assetLogs = asset ? data.recentLogs.filter((l) => l.asset_id === asset.id).sort((a, b) => b.done_date.localeCompare(a.done_date)) : [];
  const assetAnnualCost = assetLogs.reduce((s, l) => s + l.actual_cost, 0);

  return (
    <section className="mf-section">
      <SectionHead no="10" title="メンテナンス" sub="車・家などの定期メンテのタスクと費用。" />

      <div className="mf-cards4" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="mf-stat">
          <div className="mf-statlabel">今後12ヶ月の想定費用合計</div>
          <div className="mf-statvalue mf-mono">{fmt(data.totalCost)}</div>
        </div>
        <div className="mf-stat">
          <div className="mf-statlabel">今後の予定タスク数</div>
          <div className="mf-statvalue mf-mono">{data.upcoming.length}</div>
        </div>
      </div>

      <div className="mf-profiletabs" style={{ marginBottom: 10 }}>
        <button className={"mf-ptab" + (view === "upcoming" ? " active" : "")} onClick={() => setView("upcoming")}>
          今後12ヶ月
        </button>
        <button className={"mf-ptab" + (view === "byAsset" ? " active" : "")} onClick={() => setView("byAsset")}>
          資産別
        </button>
      </div>

      {view === "upcoming" && (
        <div className="mf-panel">
          {monthlyGrouped.length === 0 ? (
            <div className="mf-empty">今後12ヶ月に予定されているタスクはありません。</div>
          ) : (
            monthlyGrouped.map((mb) => (
              <div key={mb.month} style={{ marginBottom: 14 }}>
                <div className="mf-row" style={{ justifyContent: "space-between" }}>
                  <span className="mf-paneltitle" style={{ margin: 0 }}>
                    {mb.month.replace("-", "年")}月
                  </span>
                  <span className="mf-mono">{fmt(mb.cost)}</span>
                </div>
                <div className="mf-list">
                  {mb.tasks.map((t) => (
                    <div key={t.id} className="mf-listrow">
                      <span className="mf-listcat">{t.asset_name}: {t.name}</span>
                      {badgeFor(t.next_due)}
                      <span className="mf-listmemo">{t.next_due}</span>
                      <span className="mf-mono mf-listamt">{fmt(t.est_cost)}</span>
                      <button className="mf-btn ghost" style={{ padding: "4px 10px" }} onClick={() => { setCompletingId(t.id); setCompleteForm({ ...completeForm, actual_cost: String(t.est_cost) }); }}>
                        完了
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {view === "byAsset" && (
        <>
          <div className="mf-chips" style={{ marginBottom: 10 }}>
            {data.assets.map((a) => (
              <button key={a.id} className={"mf-chipbtn" + (selectedAsset === a.id ? " on" : "")} onClick={() => setSelectedAsset(a.id)}>
                {a.name}
              </button>
            ))}
          </div>
          {asset && (
            <div className="mf-panel">
              <div className="mf-paneltitle">{asset.name}</div>
              <div className="mf-cards4" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                <div className="mf-stat">
                  <div className="mf-statlabel">直近12ヶ月の維持費実績</div>
                  <div className="mf-statvalue mf-mono">{fmt(assetAnnualCost)}</div>
                </div>
                {asset.kind === "car" && (
                  <div className="mf-stat">
                    <div className="mf-statlabel">月あたり換算</div>
                    <div className="mf-statvalue mf-mono">{fmt(Math.round(assetAnnualCost / 12))}</div>
                  </div>
                )}
              </div>

              <div className="mf-paneltitle" style={{ marginTop: 14 }}>タスク一覧</div>
              <div className="mf-list">
                {assetTasks.map((t) => (
                  <div key={t.id} className="mf-listrow">
                    <span className="mf-listcat">{t.name}{!t.active && <span className="mf-numsub"> (完了/停止)</span>}</span>
                    {t.active && badgeFor(t.next_due)}
                    <span className="mf-listmemo">{t.active ? `次回: ${t.next_due}` : ""}</span>
                    <span className="mf-mono mf-listamt">{fmt(t.est_cost)}</span>
                    {t.active && (
                      <button className="mf-btn ghost" style={{ padding: "4px 10px" }} onClick={() => { setCompletingId(t.id); setCompleteForm({ ...completeForm, actual_cost: String(t.est_cost) }); }}>
                        完了
                      </button>
                    )}
                    <button className="mf-del" onClick={() => deleteTask(t.id)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="mf-paneltitle" style={{ marginTop: 14 }}>履歴（直近12ヶ月）</div>
              {assetLogs.length === 0 ? (
                <div className="mf-empty">記録はまだありません。</div>
              ) : (
                <div className="mf-list">
                  {assetLogs.map((l) => (
                    <div key={l.id} className="mf-listrow">
                      <span className="mf-mono mf-listdate">{l.done_date}</span>
                      <span className="mf-listmemo">{l.memo}</span>
                      <span className="mf-mono mf-listamt">{fmt(l.actual_cost)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {completingId && (
        <div className="mf-panel">
          <div className="mf-paneltitle">完了処理</div>
          <div className="mf-formgrid">
            <input className="mf-input" type="date" value={completeForm.done_date} onChange={(e) => setCompleteForm({ ...completeForm, done_date: e.target.value })} />
            <input className="mf-input mf-mono" type="number" placeholder="実費" value={completeForm.actual_cost} onChange={(e) => setCompleteForm({ ...completeForm, actual_cost: e.target.value })} />
            <input className="mf-input" placeholder="メモ" value={completeForm.memo} onChange={(e) => setCompleteForm({ ...completeForm, memo: e.target.value })} />
          </div>
          <label className="mf-row" style={{ marginTop: 8, gap: 6 }}>
            <input type="checkbox" checked={completeForm.createExpense} onChange={(e) => setCompleteForm({ ...completeForm, createExpense: e.target.checked })} />
            <span className="mf-numsub">支出としても記録する（二重計上防止）</span>
          </label>
          {completeForm.createExpense && (
            <>
              <div className="mf-chips">
                {accounts.map((a) => (
                  <button key={a.id} className={"mf-chipbtn" + (completeForm.account === a.id ? " on" : "")} onClick={() => setCompleteForm({ ...completeForm, account: a.id })}>
                    {a.name.replace(/（.*）/, "")}
                  </button>
                ))}
              </div>
              <div className="mf-chips">
                {allCats.map((c) => (
                  <button key={c} className={"mf-chipbtn" + (completeForm.category === c ? " on" : "")} onClick={() => setCompleteForm({ ...completeForm, category: c })}>
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="mf-row" style={{ marginTop: 10 }}>
            <button className="mf-btn primary" onClick={() => submitComplete(completingId)}>
              完了を記録
            </button>
            <button className="mf-btn ghost" onClick={() => setCompletingId(null)}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div className="mf-panel">
        {!showTaskForm ? (
          <button className="mf-btn primary" onClick={() => setShowTaskForm(true)}>
            ＋ タスクを追加
          </button>
        ) : (
          <>
            <div className="mf-paneltitle">新しいメンテタスク</div>
            <div className="mf-chips">
              {data.assets.map((a) => (
                <button key={a.id} className={"mf-chipbtn" + (taskForm.asset_id === a.id ? " on" : "")} onClick={() => setTaskForm({ ...taskForm, asset_id: a.id })}>
                  {a.name}
                </button>
              ))}
              <button className="mf-chipbtn" onClick={() => setShowAssetForm(true)}>
                ＋ 新しい資産
              </button>
            </div>
            {showAssetForm && (
              <div className="mf-formgrid" style={{ marginTop: 8 }}>
                <input className="mf-input" placeholder="資産名（例: Mark X）" value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} />
                <select className="mf-input" value={assetForm.kind} onChange={(e) => setAssetForm({ ...assetForm, kind: e.target.value })}>
                  {ASSET_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button className="mf-btn primary" onClick={submitAsset}>
                  資産を追加
                </button>
              </div>
            )}
            {taskForm.asset_id && MAINTENANCE_TEMPLATES[data.assets.find((a) => a.id === taskForm.asset_id)?.kind ?? "other"]?.length > 0 && (
              <div className="mf-chips" style={{ marginTop: 8 }}>
                {MAINTENANCE_TEMPLATES[data.assets.find((a) => a.id === taskForm.asset_id)!.kind].map((t) => (
                  <button key={t.name} className="mf-chipbtn" onClick={() => applyTemplate(t)}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <div className="mf-formgrid" style={{ marginTop: 8 }}>
              <input className="mf-input" placeholder="タスク名（例: 車検）" value={taskForm.name} onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })} />
              <input
                className="mf-input mf-mono"
                type="number"
                placeholder="繰り返し間隔（月・単発は空欄）"
                value={taskForm.interval_months}
                onChange={(e) => setTaskForm({ ...taskForm, interval_months: e.target.value })}
              />
              <input className="mf-input mf-mono" type="number" placeholder="想定費用" value={taskForm.est_cost} onChange={(e) => setTaskForm({ ...taskForm, est_cost: e.target.value })} />
              <input className="mf-input" type="date" value={taskForm.next_due} onChange={(e) => setTaskForm({ ...taskForm, next_due: e.target.value })} />
              <input className="mf-input" placeholder="メモ" value={taskForm.memo} onChange={(e) => setTaskForm({ ...taskForm, memo: e.target.value })} />
            </div>
            <div className="mf-row" style={{ marginTop: 10 }}>
              <button className="mf-btn primary" onClick={submitTask}>
                保存
              </button>
              <button
                className="mf-btn ghost"
                onClick={() => {
                  setTaskForm(emptyTaskForm);
                  setShowTaskForm(false);
                  setShowAssetForm(false);
                }}
              >
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
