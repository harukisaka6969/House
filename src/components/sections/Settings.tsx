"use client";

import { useState } from "react";
import { apiDelete, apiPost, apiPut } from "@/lib/apiClient";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";
import AnalysisExport from "./AnalysisExport";
import PatternGrid from "../PatternGrid";
import { isValidPatternSequence, patternToCode } from "@/lib/pattern";

type AuthMethod = "pin" | "pattern";

const emptyFamilyForm = { slug: "", name: "" };

/** 認証方法（PIN／9点パターン）を選び、新しい資格情報が確定するたびに credential を通知する。
 * 確定前（未入力・パターン未確認など）は credential に null を渡す。 */
function AuthMethodPicker({ onChange, size = 200 }: { onChange: (method: AuthMethod, credential: string | null) => void; size?: number }) {
  const [method, setMethodState] = useState<AuthMethod>("pin");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [patternFirst, setPatternFirst] = useState<number[] | null>(null);
  const [patternMsg, setPatternMsg] = useState("");
  const [gridKey, setGridKey] = useState(0);

  const setMethod = (m: AuthMethod) => {
    setMethodState(m);
    setPin("");
    setPinConfirm("");
    setPatternFirst(null);
    setPatternMsg("");
    setGridKey((k) => k + 1);
    onChange(m, null);
  };

  const updatePin = (next: string, confirm: string) => {
    setPin(next);
    setPinConfirm(confirm);
    onChange("pin", /^\d{4,8}$/.test(next) && next === confirm ? next : null);
  };

  const handlePatternDraw = (nodes: number[]) => {
    if (!patternFirst) {
      if (!isValidPatternSequence(nodes)) {
        setPatternMsg("4つ以上の点をなぞってください");
        setGridKey((k) => k + 1);
        return;
      }
      setPatternFirst(nodes);
      setPatternMsg("もう一度同じパターンをなぞって確認してください");
      setGridKey((k) => k + 1);
      return;
    }
    const matches = nodes.length === patternFirst.length && nodes.every((n, i) => n === patternFirst[i]);
    setGridKey((k) => k + 1);
    if (matches) {
      setPatternMsg("✓ 確認できました");
      onChange("pattern", patternToCode(nodes));
    } else {
      setPatternMsg("パターンが一致しませんでした。最初からやり直してください。");
      setPatternFirst(null);
      onChange("pattern", null);
    }
  };

  return (
    <div>
      <div className="mf-row" style={{ marginBottom: 10 }}>
        <button type="button" className={"mf-chipbtn" + (method === "pin" ? " on" : "")} onClick={() => setMethod("pin")}>
          暗証番号（PIN）
        </button>
        <button type="button" className={"mf-chipbtn" + (method === "pattern" ? " on" : "")} onClick={() => setMethod("pattern")}>
          9点パターン
        </button>
      </div>
      {method === "pin" ? (
        <div className="mf-formgrid">
          <input
            className="mf-input mf-mono"
            type="password"
            inputMode="numeric"
            placeholder="新しいPIN（4〜8桁）"
            value={pin}
            onChange={(e) => updatePin(e.target.value, pinConfirm)}
          />
          <input
            className="mf-input mf-mono"
            type="password"
            inputMode="numeric"
            placeholder="新しいPIN（確認）"
            value={pinConfirm}
            onChange={(e) => updatePin(pin, e.target.value)}
          />
        </div>
      ) : (
        <div>
          <PatternGrid key={gridKey} onComplete={handlePatternDraw} size={size} hint={patternFirst ? "もう一度なぞって確認" : "新しいパターンをなぞる"} />
          {patternMsg && <div className="mf-hint">{patternMsg}</div>}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { month, monthKey, settings, refreshMonth, refreshSettings } = useDashboard();
  const [incomeDraft, setIncomeDraft] = useState<{ id?: string; name: string; amount: number; owner: string | null }[] | null>(null);
  const [acctDraft, setAcctDraft] = useState<Record<string, { name: string; budget: number }> | null>(null);
  const [ownCurrentCred, setOwnCurrentCred] = useState("");
  const [ownNewMethod, setOwnNewMethod] = useState<AuthMethod>("pin");
  const [ownNewCred, setOwnNewCred] = useState<string | null>(null);
  const [ownPickerKey, setOwnPickerKey] = useState(0);
  const [pinMsg, setPinMsg] = useState("");
  const [kioskNewMethod, setKioskNewMethod] = useState<AuthMethod>("pin");
  const [kioskNewCred, setKioskNewCred] = useState<string | null>(null);
  const [kioskPickerKey, setKioskPickerKey] = useState(0);
  const [kioskMsg, setKioskMsg] = useState("");
  const [lineIdInput, setLineIdInput] = useState("");
  const [lineMsg, setLineMsg] = useState("");
  const [reminderHour, setReminderHour] = useState("07");
  const [reminderMinute, setReminderMinute] = useState("00");
  const [reminderMsg, setReminderMsg] = useState("");
  const [familyForm, setFamilyForm] = useState(emptyFamilyForm);
  const [familyNewMethod, setFamilyNewMethod] = useState<AuthMethod>("pin");
  const [familyNewCred, setFamilyNewCred] = useState<string | null>(null);
  const [familyPickerKey, setFamilyPickerKey] = useState(0);
  const [familyMsg, setFamilyMsg] = useState("");
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [resetPinTargetId, setResetPinTargetId] = useState<string | null>(null);
  const [resetMethod, setResetMethod] = useState<AuthMethod>("pin");
  const [resetCred, setResetCred] = useState<string | null>(null);
  const [resetPickerKey, setResetPickerKey] = useState(0);

  if (!month || !settings) return null;

  const incomes: { id?: string; name: string; amount: number; owner: string | null }[] =
    incomeDraft ?? month.incomes.map((i) => ({ id: i.id, name: i.name, amount: i.amount, owner: i.owner }));
  const accounts = settings.accounts;
  const acctValues = acctDraft ?? Object.fromEntries(accounts.map((a) => [a.id, { name: a.name, budget: a.budget }]));

  const saveIncomes = async (next: { id?: string; name: string; amount: number; owner: string | null }[]) => {
    setIncomeDraft(next);
    await apiPut(`/api/incomes?m=${monthKey}`, { incomes: next.map((i) => ({ name: i.name, amount: i.amount, owner: i.owner })) });
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
    if (!ownCurrentCred) {
      setPinMsg("現在の認証情報を入力してください。");
      return;
    }
    if (!ownNewCred) {
      setPinMsg(ownNewMethod === "pin" ? "新しいPINを正しく入力してください。" : "新しいパターンの設定が完了していません。");
      return;
    }
    try {
      await apiPut("/api/settings", { current_credential: ownCurrentCred, new_auth_method: ownNewMethod, new_credential: ownNewCred });
      setPinMsg("✓ 認証方法を変更しました。");
      setOwnCurrentCred("");
      setOwnNewCred(null);
      setOwnPickerKey((k) => k + 1);
      refreshSettings();
    } catch (e) {
      setPinMsg(e instanceof Error ? e.message : "変更に失敗しました。");
    }
  };

  const setKioskPin = async () => {
    setKioskMsg("");
    if (!kioskNewCred) {
      setKioskMsg(kioskNewMethod === "pin" ? "PINを正しく入力してください。" : "パターンの設定が完了していません。");
      return;
    }
    try {
      await apiPost("/api/settings/kiosk-pin", { auth_method: kioskNewMethod, credential: kioskNewCred });
      setKioskMsg("✓ 設定しました。/kiosk からこの認証方法でログインできます。");
      setKioskNewCred(null);
      setKioskPickerKey((k) => k + 1);
      refreshSettings();
    } catch (e) {
      setKioskMsg(e instanceof Error ? e.message : "設定に失敗しました。");
    }
  };

  const saveLineId = async (value: string) => {
    setLineMsg("");
    try {
      await apiPost("/api/settings/line-user-id", { line_user_id: value });
      setLineMsg(value ? "✓ 保存しました。" : "解除しました。");
      setLineIdInput("");
      refreshSettings();
    } catch (e) {
      setLineMsg(e instanceof Error ? e.message : "保存に失敗しました。");
    }
  };

  const saveReminderTime = async (time: string | null) => {
    setReminderMsg("");
    try {
      await apiPost("/api/settings/line-reminder-time", { time });
      setReminderMsg(time ? `✓ 毎日${time}に届くよう設定しました。` : "オフにしました。");
      refreshSettings();
    } catch (e) {
      setReminderMsg(e instanceof Error ? e.message : "設定に失敗しました。");
    }
  };

  const createFamilyAccount = async () => {
    setFamilyMsg("");
    if (!/^[a-z0-9-]{3,32}$/.test(familyForm.slug)) {
      setFamilyMsg("URLは半角英小文字・数字・ハイフンで3〜32文字にしてください。");
      return;
    }
    if (!familyNewCred) {
      setFamilyMsg(familyNewMethod === "pin" ? "PINを正しく入力してください。" : "パターンの設定が完了していません。");
      return;
    }
    try {
      await apiPost("/api/family-accounts", { ...familyForm, auth_method: familyNewMethod, credential: familyNewCred });
      setFamilyForm(emptyFamilyForm);
      setFamilyNewCred(null);
      setFamilyPickerKey((k) => k + 1);
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
    if (!resetCred) {
      setFamilyMsg(resetMethod === "pin" ? "PINを正しく入力してください。" : "パターンの設定が完了していません。");
      return;
    }
    await apiPost(`/api/family-accounts/${id}/reset-pin`, { auth_method: resetMethod, credential: resetCred });
    setResetPinTargetId(null);
    setResetCred(null);
    setResetPickerKey((k) => k + 1);
    setFamilyMsg("✓ 認証情報をリセットしました。");
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
        <button className="mf-btn ghost" onClick={() => saveIncomes([...incomes, { name: "", amount: 0, owner: null }])}>
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
        <div className="mf-paneltitle">認証方法の変更（現在: {settings.profile.authMethod === "pattern" ? "9点パターン" : "PIN"}）</div>
        <div className="mf-hint" style={{ marginTop: 0, opacity: 0.75 }}>
          暗証番号（PIN）と9点パターンのどちらか一方だけを使います。切り替えると、次回ログイン時からはこちらの画面だけが表示されます。
        </div>
        <div className="mf-hint" style={{ marginTop: 8, marginBottom: 4 }}>
          本人確認（現在の{settings.profile.authMethod === "pattern" ? "パターン" : "PIN"}）
        </div>
        {settings.profile.authMethod === "pattern" ? (
          <PatternGrid
            key={ownPickerKey + "-current"}
            onComplete={(nodes) => setOwnCurrentCred(isValidPatternSequence(nodes) ? patternToCode(nodes) : "")}
            size={180}
            hint={ownCurrentCred ? "✓ 入力済み（変更する場合はもう一度なぞる）" : "現在のパターンをなぞる"}
          />
        ) : (
          <input
            className="mf-input mf-mono"
            type="password"
            inputMode="numeric"
            placeholder="現在のPIN"
            value={ownCurrentCred}
            onChange={(e) => setOwnCurrentCred(e.target.value)}
          />
        )}
        <div className="mf-hint" style={{ marginTop: 14, marginBottom: 4 }}>
          新しい認証方法
        </div>
        <AuthMethodPicker key={ownPickerKey} onChange={(m, c) => { setOwnNewMethod(m); setOwnNewCred(c); }} />
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" onClick={changePin}>
            変更する
          </button>
        </div>
        {pinMsg && <div className="mf-hint">{pinMsg}</div>}
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">
          🖥 共用ダッシュボードの認証{" "}
          {settings.kioskConfigured ? `（設定済み・${settings.kioskAuthMethod === "pattern" ? "9点パターン" : "PIN"}）` : "（未設定）"}
        </div>
        <div className="mf-hint" style={{ marginTop: 0, opacity: 0.75 }}>
          iPad等に常時表示する「共用ダッシュボード」専用の認証です。個々の日記・支出明細など個別のデータには一切アクセスできず、買い物リスト・リマインダー・おおまかなお金の状況のみ見られます。設定後は「/kiosk」からこの認証方法でログインしてください。
        </div>
        <AuthMethodPicker key={kioskPickerKey} onChange={(m, c) => { setKioskNewMethod(m); setKioskNewCred(c); }} />
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" onClick={setKioskPin}>
            {settings.kioskConfigured ? "変更する" : "設定する"}
          </button>
        </div>
        {kioskMsg && <div className="mf-hint">{kioskMsg}</div>}
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">📱 LINE通知 {settings.lineUserId ? "（設定済み）" : "（未設定）"}</div>
        <div className="mf-hint" style={{ marginTop: 0, opacity: 0.75 }}>
          買い物リストの承認依頼・承認完了・ジム開始などをLINEに届けます。①
          家計簿のLINE公式アカウントを友だち追加、② 何かメッセージを送るとあなたのユーザーIDが返信されるので、③
          それをコピーしてここに貼り付けて保存してください。
          {!settings.lineNotifyAvailable && "（現在サーバー側でLINE連携が未設定のため、設定してもまだ通知は届きません）"}
        </div>
        {settings.lineUserId && (
          <div className="mf-hint" style={{ marginTop: 0 }}>
            現在のユーザーID: {settings.lineUserId}
          </div>
        )}
        <div className="mf-formgrid">
          <input
            className="mf-input mf-mono"
            placeholder="LINEユーザーID（Uで始まる文字列）"
            value={lineIdInput}
            onChange={(e) => setLineIdInput(e.target.value)}
          />
        </div>
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" onClick={() => saveLineId(lineIdInput.trim())}>
            保存する
          </button>
          {settings.lineUserId && (
            <button className="mf-btn ghost" onClick={() => saveLineId("")}>
              解除する
            </button>
          )}
        </div>
        {lineMsg && <div className="mf-hint">{lineMsg}</div>}
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">
          🔔 リマインダー通知の時刻 {settings.lineReminderTime ? `（毎日 ${settings.lineReminderTime}）` : "（オフ）"}
        </div>
        <div className="mf-hint" style={{ marginTop: 0, opacity: 0.75 }}>
          今日やること（リマインダー）・在庫切れのお知らせを、毎日好きな時刻にLINEへまとめて届けます。15分刻みで指定でき、必要なければオフのままで届きません。
        </div>
        <div className="mf-row" style={{ marginTop: 6, gap: 8 }}>
          <select className="mf-input mf-mono" style={{ width: 90 }} value={reminderHour} onChange={(e) => setReminderHour(e.target.value)}>
            {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")).map((h) => (
              <option key={h} value={h}>
                {h}時
              </option>
            ))}
          </select>
          <select className="mf-input mf-mono" style={{ width: 90 }} value={reminderMinute} onChange={(e) => setReminderMinute(e.target.value)}>
            {["00", "15", "30", "45"].map((m) => (
              <option key={m} value={m}>
                {m}分
              </option>
            ))}
          </select>
        </div>
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" onClick={() => saveReminderTime(`${reminderHour}:${reminderMinute}`)}>
            この時刻に設定する
          </button>
          {settings.lineReminderTime && (
            <button className="mf-btn ghost" onClick={() => saveReminderTime(null)}>
              オフにする
            </button>
          )}
        </div>
        {reminderMsg && <div className="mf-hint">{reminderMsg}</div>}
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
                  <span className="mf-listmemo">
                    /{f.slug} ・ {f.auth_method === "pattern" ? "パターン" : "PIN"}
                  </span>
                  <button
                    className="mf-btn ghost"
                    style={{ padding: "4px 10px" }}
                    onClick={() => {
                      setResetPinTargetId(f.id);
                      setResetCred(null);
                      setResetPickerKey((k) => k + 1);
                    }}
                  >
                    認証リセット
                  </button>
                  <button className="mf-del" onClick={() => deleteFamilyAccount(f.id)}>
                    削除
                  </button>
                </div>
                {resetPinTargetId === f.id && (
                  <div style={{ marginTop: 6 }}>
                    <AuthMethodPicker
                      key={resetPickerKey}
                      size={180}
                      onChange={(m, c) => {
                        setResetMethod(m);
                        setResetCred(c);
                      }}
                    />
                    <div className="mf-row" style={{ marginTop: 8 }}>
                      <button className="mf-btn primary" onClick={() => submitResetPin(f.id)}>
                        更新
                      </button>
                      <button className="mf-btn ghost" onClick={() => setResetPinTargetId(null)}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!showFamilyForm ? (
          <button
            className="mf-btn primary"
            style={{ marginTop: 10 }}
            onClick={() => {
              setShowFamilyForm(true);
              setFamilyNewCred(null);
              setFamilyPickerKey((k) => k + 1);
            }}
          >
            ＋ 家族アカウントを作成
          </button>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div className="mf-formgrid">
              <input className="mf-input" placeholder="URL（例: family-x7k2）" value={familyForm.slug} onChange={(e) => setFamilyForm({ ...familyForm, slug: e.target.value })} />
              <input className="mf-input" placeholder="表示名（例: 坂家（家族用）)" value={familyForm.name} onChange={(e) => setFamilyForm({ ...familyForm, name: e.target.value })} />
            </div>
            <div style={{ marginTop: 8 }}>
              <AuthMethodPicker key={familyPickerKey} onChange={(m, c) => { setFamilyNewMethod(m); setFamilyNewCred(c); }} />
            </div>
            <div className="mf-row" style={{ marginTop: 8 }}>
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
