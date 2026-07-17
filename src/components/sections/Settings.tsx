"use client";

import { useState } from "react";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";
import AnalysisExport from "./AnalysisExport";

const emptyFamilyForm = { slug: "", name: "", pin: "" };

export default function Settings() {
  const { month, monthKey, settings, refreshMonth, refreshSettings, refreshMe, me } = useDashboard();
  const [incomeDraft, setIncomeDraft] = useState<{ id?: string; name: string; amount: number }[] | null>(null);
  const [acctDraft, setAcctDraft] = useState<Record<string, { name: string; budget: number }> | null>(null);
  const [pinForm, setPinForm] = useState({ current: "", next: "", confirm: "" });
  const [pinMsg, setPinMsg] = useState("");
  const [deviceMsg, setDeviceMsg] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [familyForm, setFamilyForm] = useState(emptyFamilyForm);
  const [familyMsg, setFamilyMsg] = useState("");
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [resetPinTargetId, setResetPinTargetId] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState("");

  if (!month || !settings) return null;

  const incomes: { id?: string; name: string; amount: number }[] = incomeDraft ?? month.incomes.map((i) => ({ id: i.id, name: i.name, amount: i.amount }));
  const accounts = settings.accounts;
  const acctValues = acctDraft ?? Object.fromEntries(accounts.map((a) => [a.id, { name: a.name, budget: a.budget }]));

  const saveIncomes = async (next: { id?: string; name: string; amount: number }[]) => {
    setIncomeDraft(next);
    await apiPut(`/api/incomes?m=${monthKey}`, { incomes: next.map((i) => ({ name: i.name, amount: i.amount })) });
    refreshMonth();
  };

  const saveAccounts = async (next: Record<string, { name: string; budget: number }>) => {
    setAcctDraft(next);
    await apiPut("/api/accounts", { accounts: Object.entries(next).map(([id, v]) => ({ id, name: v.name, budget: v.budget })) });
    refreshMonth();
    refreshSettings();
  };

  const deleteCategory = async (name: string) => {
    await apiDelete(`/api/custom-categories/${encodeURIComponent(name)}`);
    refreshSettings();
  };

  const changePin = async () => {
    setPinMsg("");
    if (!/^\d{4,8}$/.test(pinForm.next)) {
      setPinMsg("新しいPINは4〜8桁の数字にしてください。");
      return;
    }
    if (pinForm.next !== pinForm.confirm) {
      setPinMsg("確認用PINが一致しません。");
      return;
    }
    try {
      await apiPut("/api/settings", { current_pin: pinForm.current, new_pin: pinForm.next });
      setPinMsg("✓ PINを変更しました。");
      setPinForm({ current: "", next: "", confirm: "" });
    } catch (e) {
      setPinMsg(e instanceof Error ? e.message : "PINの変更に失敗しました。");
    }
  };

  const registerPasskey = async () => {
    setDeviceMsg("");
    setRegBusy(true);
    try {
      if (!browserSupportsWebAuthn()) throw new Error("このブラウザはパスキーに対応していません。");
      const options = await apiGet<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/auth/webauthn/register-options");
      const response = await startRegistration({ optionsJSON: options });
      const deviceName = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 40) : "このデバイス";
      await apiPost("/api/auth/webauthn/register-verify", { response, deviceName });
      setDeviceMsg("✓ このデバイスをFace ID / Touch IDに登録しました。");
      refreshMe();
    } catch (e) {
      setDeviceMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setRegBusy(false);
    }
  };

  const removeDevice = async (id: string) => {
    await apiDelete(`/api/auth/webauthn/${id}`);
    refreshMe();
  };

  const createFamilyAccount = async () => {
    setFamilyMsg("");
    if (!/^[a-z0-9-]{3,32}$/.test(familyForm.slug)) {
      setFamilyMsg("URLは半角英小文字・数字・ハイフンで3〜32文字にしてください。");
      return;
    }
    if (!/^\d{4,8}$/.test(familyForm.pin)) {
      setFamilyMsg("PINは4〜8桁の数字にしてください。");
      return;
    }
    try {
      await apiPost("/api/family-accounts", familyForm);
      setFamilyForm(emptyFamilyForm);
      setShowFamilyForm(false);
      setFamilyMsg("✓ 家族アカウントを作成しました。");
      refreshSettings();
    } catch (e) {
      setFamilyMsg(e instanceof Error ? e.message : "作成に失敗しました。");
    }
  };

  const deleteFamilyAccount = async (id: string) => {
    await apiDelete(`/api/family-accounts/${id}`);
    refreshSettings();
  };

  const submitResetPin = async (id: string) => {
    if (!/^\d{4,8}$/.test(resetPinValue)) {
      setFamilyMsg("PINは4〜8桁の数字にしてください。");
      return;
    }
    await apiPost(`/api/family-accounts/${id}/reset-pin`, { pin: resetPinValue });
    setResetPinTargetId(null);
    setResetPinValue("");
    setFamilyMsg("✓ PINをリセットしました。");
  };

  return (
    <section className="mf-section">
      <SectionHead no="07" title="設定" sub="収入・口座・プロフィールはいつでも調整できます。" />

      <div className="mf-panel">
        <div className="mf-paneltitle">今月の収入（変動に合わせて毎月調整可）</div>
        {incomes.map((inc, i) => (
          <div key={inc.id ?? i} className="mf-row">
            <input
              className="mf-input"
              style={{ flex: 2 }}
              value={inc.name}
              placeholder="収入源（給与・副業など）"
              onChange={(e) => {
                const next = incomes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x));
                setIncomeDraft(next);
              }}
              onBlur={() => saveIncomes(incomes)}
            />
            <input
              className="mf-input mf-mono"
              style={{ flex: 1 }}
              type="number"
              value={inc.amount || ""}
              placeholder="金額"
              onChange={(e) => {
                const next = incomes.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x));
                setIncomeDraft(next);
              }}
              onBlur={() => saveIncomes(incomes)}
            />
            <button className="mf-del" onClick={() => saveIncomes(incomes.filter((_, j) => j !== i))}>
              削除
            </button>
          </div>
        ))}
        <button className="mf-btn ghost" onClick={() => saveIncomes([...incomes, { name: "", amount: 0 }])}>
          ＋ 収入源を追加
        </button>
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">口座の名前と月次予算</div>
        {accounts.map((a) => {
          const v = acctValues[a.id] ?? { name: a.name, budget: a.budget };
          return (
            <div key={a.id} className="mf-row">
              <span className="mf-dot" style={{ background: a.color }} />
              <input
                className="mf-input"
                style={{ flex: 2 }}
                value={v.name}
                onChange={(e) => setAcctDraft({ ...acctValues, [a.id]: { ...v, name: e.target.value } })}
                onBlur={() => saveAccounts(acctValues)}
              />
              <input
                className="mf-input mf-mono"
                style={{ flex: 1 }}
                type="number"
                value={v.budget || ""}
                placeholder="予算"
                onChange={(e) => setAcctDraft({ ...acctValues, [a.id]: { ...v, budget: Number(e.target.value) } })}
                onBlur={() => saveAccounts(acctValues)}
              />
            </div>
          );
        })}
      </div>

      {settings.customCategories.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">自動追加されたカテゴリ（「その他」の学習結果）</div>
          <div className="mf-chips">
            {settings.customCategories.map((c) => (
              <span key={c} className="mf-chipbtn on" style={{ cursor: "default" }}>
                {c}
                <button className="mf-del" style={{ padding: "0 2px", fontSize: 13 }} title="カテゴリを削除" onClick={() => deleteCategory(c)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mf-hint" style={{ opacity: 0.7 }}>
            削除しても、このカテゴリを使った過去の記録はそのまま残ります。
          </div>
        </div>
      )}

      <div className="mf-panel">
        <div className="mf-paneltitle">PIN変更</div>
        <div className="mf-formgrid">
          <input
            className="mf-input mf-mono"
            type="password"
            inputMode="numeric"
            placeholder="現在のPIN"
            value={pinForm.current}
            onChange={(e) => setPinForm({ ...pinForm, current: e.target.value })}
          />
          <input
            className="mf-input mf-mono"
            type="password"
            inputMode="numeric"
            placeholder="新しいPIN（4〜8桁）"
            value={pinForm.next}
            onChange={(e) => setPinForm({ ...pinForm, next: e.target.value })}
          />
          <input
            className="mf-input mf-mono"
            type="password"
            inputMode="numeric"
            placeholder="新しいPIN（確認）"
            value={pinForm.confirm}
            onChange={(e) => setPinForm({ ...pinForm, confirm: e.target.value })}
          />
        </div>
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" onClick={changePin}>
            変更する
          </button>
        </div>
        {pinMsg && <div className="mf-hint">{pinMsg}</div>}
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">パスキー（Face ID / Touch ID）</div>
        <button className="mf-btn primary" disabled={regBusy} onClick={registerPasskey}>
          {regBusy ? "登録中…" : "このデバイスを登録する"}
        </button>
        {deviceMsg && <div className="mf-hint">{deviceMsg}</div>}
        {(me?.devices.length ?? 0) > 0 && (
          <div className="mf-list" style={{ marginTop: 10 }}>
            {me!.devices.map((d) => (
              <div key={d.id} className="mf-listrow">
                <span className="mf-listcat">{d.device_name || "デバイス"}</span>
                <span className="mf-listmemo">{new Date(d.created_at).toLocaleDateString("ja-JP")} 登録</span>
                <button className="mf-del" onClick={() => removeDevice(d.id)}>
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mf-hint" style={{ opacity: 0.7 }}>
          パスキーは端末ごとに登録が必要です。新しい端末では一度PINでログインしてから登録してください。
        </div>
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">家族アカウント（閲覧専用）</div>
        <div className="mf-hint" style={{ marginTop: 0, opacity: 0.75 }}>
          両親などに、予定（買う予定のもの・将来設計・メンテ予定）だけを見せる閲覧専用アカウントです。財務状態（貯蓄・収支・実績）は一切見えません。
        </div>
        {(settings.familyAccounts?.length ?? 0) > 0 && (
          <div className="mf-list" style={{ marginTop: 8 }}>
            {settings.familyAccounts.map((f) => (
              <div key={f.id}>
                <div className="mf-listrow">
                  <span className="mf-listcat">{f.name}</span>
                  <span className="mf-listmemo">/{f.slug}</span>
                  <button className="mf-btn ghost" style={{ padding: "4px 10px" }} onClick={() => { setResetPinTargetId(f.id); setResetPinValue(""); }}>
                    PINリセット
                  </button>
                  <button className="mf-del" onClick={() => deleteFamilyAccount(f.id)}>
                    削除
                  </button>
                </div>
                {resetPinTargetId === f.id && (
                  <div className="mf-row" style={{ marginTop: 6 }}>
                    <input
                      className="mf-input mf-mono"
                      type="password"
                      inputMode="numeric"
                      placeholder="新しいPIN（4〜8桁）"
                      value={resetPinValue}
                      onChange={(e) => setResetPinValue(e.target.value)}
                    />
                    <button className="mf-btn primary" onClick={() => submitResetPin(f.id)}>
                      更新
                    </button>
                    <button className="mf-btn ghost" onClick={() => setResetPinTargetId(null)}>
                      キャンセル
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!showFamilyForm ? (
          <button className="mf-btn primary" style={{ marginTop: 10 }} onClick={() => setShowFamilyForm(true)}>
            ＋ 家族アカウントを作成
          </button>
        ) : (
          <div className="mf-formgrid" style={{ marginTop: 8 }}>
            <input className="mf-input" placeholder="URL（例: family-x7k2）" value={familyForm.slug} onChange={(e) => setFamilyForm({ ...familyForm, slug: e.target.value })} />
            <input className="mf-input" placeholder="表示名（例: 坂家（家族用）)" value={familyForm.name} onChange={(e) => setFamilyForm({ ...familyForm, name: e.target.value })} />
            <input
              className="mf-input mf-mono"
              type="password"
              inputMode="numeric"
              placeholder="PIN（4〜8桁）"
              value={familyForm.pin}
              onChange={(e) => setFamilyForm({ ...familyForm, pin: e.target.value })}
            />
            <div className="mf-row">
              <button className="mf-btn primary" onClick={createFamilyAccount}>
                作成
              </button>
              <button className="mf-btn ghost" onClick={() => { setShowFamilyForm(false); setFamilyForm(emptyFamilyForm); }}>
                キャンセル
              </button>
            </div>
          </div>
        )}
        {familyMsg && <div className="mf-hint">{familyMsg}</div>}
      </div>

      <AnalysisExport />
    </section>
  );
}
