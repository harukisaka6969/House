"use client";

import { useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import { todayStrJST } from "@/lib/date";
import { SectionHead } from "../common";

interface ParkingOption {
  type: string;
  name: string;
  estimated_cost: number;
  walk_minutes: number | null;
  notes: string;
  timing_advice: string | null;
}

interface ParkingResearch {
  destination: string;
  options: ParkingOption[];
  general_notes: string;
}

export default function CarTrip() {
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(todayStrJST());
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<ParkingResearch | null>(null);
  /** quick=Web検索なしの暫定表示、detailed=Web検索で確認済み。 */
  const [resultMode, setResultMode] = useState<"quick" | "detailed" | null>(null);
  /** idle→loading（まだ何も出ていない）→quick（暫定表示中・検索継続）→done。 */
  const [phase, setPhase] = useState<"idle" | "loading" | "quick" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 連続で検索したとき、古いリクエストの結果で上書きしないための世代番号。 */
  const runIdRef = useRef(0);

  const stopProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => stopProgress, []);

  const busy = phase === "loading" || phase === "quick";

  const search = () => {
    if (!destination.trim()) {
      setErr("行き先を入力してください。");
      return;
    }
    if (endTime <= startTime) {
      setErr("終了時刻は開始時刻より後にしてください。");
      return;
    }
    const runId = ++runIdRef.current;
    setErr("");
    setResult(null);
    setResultMode(null);
    setPhase("loading");

    // サーバーからの進捗は取れないので、経過時間から見込みの進捗を出す（20秒で約80%、
    // 頭打ちは95%。検索が返ってきた時点で100%にする）。
    setProgress(0);
    const startedAt = Date.now();
    stopProgress();
    timerRef.current = setInterval(() => {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      setProgress(Math.round(95 * (1 - Math.exp(-elapsedSec / 12))));
    }, 300);

    const body = { destination: destination.trim(), date, start_time: startTime, end_time: endTime };
    const post = (mode: "quick" | "detailed") => apiPost<{ result: ParkingResearch }>("/api/car-trip/parking", { ...body, mode });

    // 速さのために2本同時に投げる。検索なしの暫定結果（数秒）をまず表示し、
    // Web検索つきの結果が返ってきたら差し替える。
    let quickFailed = false;
    let quickShown = false;
    let detailedDone = false;
    let detailedFailed = false;

    post("quick")
      .then(({ result: r }) => {
        if (runId !== runIdRef.current || detailedDone) return;
        quickShown = true;
        setResult(r);
        setResultMode("quick");
        setPhase("quick");
      })
      .catch(() => {
        quickFailed = true;
        // 検索つきが先に失敗していた場合は、この時点で初めて「両方失敗」が確定する。
        if (runId === runIdRef.current && detailedFailed) {
          setErr("駐車場情報の取得に失敗しました。時間をおいてもう一度試してください。");
        }
      });

    post("detailed")
      .then(({ result: r }) => {
        detailedDone = true;
        if (runId !== runIdRef.current) return;
        setResult(r);
        setResultMode("detailed");
        setPhase("done");
        stopProgress();
        setProgress(100);
      })
      .catch(() => {
        detailedDone = true;
        detailedFailed = true;
        if (runId !== runIdRef.current) return;
        stopProgress();
        setProgress(100);
        if (quickShown) {
          // 暫定結果だけでも出ていれば、それを残したまま検索失敗を伝える。
          setErr("Web検索での確認に失敗しました。以下はAIの知識だけによる概算です。");
          setPhase("done");
          return;
        }
        setPhase("idle");
        if (quickFailed) setErr("駐車場情報の取得に失敗しました。時間をおいてもう一度試してください。");
      });
  };

  const sorted = result ? [...result.options].sort((a, b) => a.estimated_cost - b.estimated_cost) : [];

  return (
    <section className="mf-section">
      <SectionHead
        no="30"
        title="車移動"
        sub="行き先と時間帯を入力すると、徒歩併用・手前の駅に停めて1〜2駅だけ電車・蕨駅から電車のみ（往復運賃）も含め、コスパの良い移動方法をAIが複数パターン提案します。まず概算をすぐ表示し、Web検索で確認した結果に差し替えます。"
      />

      <div className="mf-panel">
        <label className="mf-fieldlabel required" htmlFor="ct-dest">
          行き先
        </label>
        <input
          id="ct-dest"
          className="mf-input"
          placeholder="例: 渋谷スクランブルスクエア、〇〇市〇〇町のイオン"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />

        <label className="mf-fieldlabel" htmlFor="ct-date">
          日付
        </label>
        <input id="ct-date" className="mf-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <div className="mf-row">
          <div style={{ flex: 1 }}>
            <label className="mf-fieldlabel" htmlFor="ct-start">
              到着（駐車開始）
            </label>
            <input id="ct-start" className="mf-input mf-mono" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="mf-fieldlabel" htmlFor="ct-end">
              出発（駐車終了）
            </label>
            <input id="ct-end" className="mf-input mf-mono" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <button className="mf-btn primary" style={{ marginTop: 10 }} disabled={busy} onClick={search}>
          {busy ? "検索中…" : "コスパの良い駐車方法を調べる"}
        </button>
        {busy && (
          <>
            <div className="mf-bar">
              <div className="mf-barfill" style={{ width: `${progress}%`, background: "#4C9AFF" }} />
            </div>
            <div className="mf-numsub mf-mono" style={{ marginTop: 4 }}>
              {progress}%
              <span className="mf-mono" style={{ marginLeft: 8, fontFamily: "inherit" }}>
                {phase === "quick" ? "Web検索で実際の料金を確認中…（下は概算）" : "まず概算を出しています…"}
              </span>
            </div>
          </>
        )}
        {err && <div className="mf-hint" style={{ color: "#F26D5F" }}>{err}</div>}
      </div>

      {result && (
        <>
          <div className="mf-hint" style={{ opacity: 0.75 }}>
            {resultMode === "detailed" ? "✓ Web検索で料金・条件を確認した結果です。" : "⏳ AIの知識だけによる概算です（Web検索の結果に差し替わります）。"}
          </div>
          {sorted.length === 0 ? (
            <div className="mf-panel">
              <div className="mf-empty">この行き先の駐車場情報が見つかりませんでした。行き先をもう少し具体的に（施設名や住所）入力してみてください。</div>
            </div>
          ) : (
            sorted.map((o, i) => (
              <div key={i} className="mf-panel" style={{ borderColor: i === 0 ? "rgba(245,165,36,0.5)" : undefined }}>
                <div className="mf-row" style={{ justifyContent: "space-between", marginTop: 0 }}>
                  <div>
                    <span className="mf-chip" style={{ marginRight: 8 }}>
                      {o.type}
                    </span>
                    {i === 0 && (
                      <span className="mf-chip" style={{ background: "rgba(245,165,36,0.15)", color: "#F5A524" }}>
                        一番お得
                      </span>
                    )}
                    <div className="mf-paneltitle" style={{ marginTop: 6, marginBottom: 0 }}>
                      {o.name || result.destination}
                    </div>
                  </div>
                  <div className="mf-num mf-mono" style={{ textAlign: "right" }}>
                    {fmt(o.estimated_cost)}
                    {o.walk_minutes != null && (
                      <div className="mf-numsub" style={{ marginTop: 2 }}>
                        徒歩 約{o.walk_minutes}分
                      </div>
                    )}
                  </div>
                </div>
                {o.notes && (
                  <div className="mf-hint" style={{ opacity: 0.85, marginTop: 8 }}>
                    {o.notes}
                  </div>
                )}
                {o.timing_advice && (
                  <div className="mf-hint" style={{ marginTop: 6, color: "#45C48F" }}>
                    ⏱ {o.timing_advice}
                  </div>
                )}
              </div>
            ))
          )}
          {result.general_notes && (
            <div className="mf-panel">
              <div className="mf-hint" style={{ opacity: 0.75, marginTop: 0 }}>
                {result.general_notes}
              </div>
            </div>
          )}
          <div className="mf-hint" style={{ opacity: 0.6 }}>
            ※ AIによるWeb検索結果のため、料金・条件は実際と異なる場合があります。現地の看板・公式情報で必ず確認してください。「実質無料」に分類された場所は法的・マナー上のリスクがある場合があるので、内容をよく読んで自己責任で判断してください。
          </div>
        </>
      )}
    </section>
  );
}
