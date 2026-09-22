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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<ParkingResearch | null>(null);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => stopProgress, []);

  const search = async () => {
    if (!destination.trim()) {
      setErr("行き先を入力してください。");
      return;
    }
    if (endTime <= startTime) {
      setErr("終了時刻は開始時刻より後にしてください。");
      return;
    }
    setBusy(true);
    setErr("");
    setResult(null);

    // サーバーからの進捗は取れないので、経過時間から見込みの進捗を出す（30秒で約85%、
    // 頭打ちは95%。実際に返ってきた時点で100%にする）。
    setProgress(0);
    const startedAt = Date.now();
    stopProgress();
    timerRef.current = setInterval(() => {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      setProgress(Math.round(95 * (1 - Math.exp(-elapsedSec / 13))));
    }, 300);

    try {
      const { result: r } = await apiPost<{ result: ParkingResearch }>("/api/car-trip/parking", {
        destination: destination.trim(),
        date,
        start_time: startTime,
        end_time: endTime,
      });
      setResult(r);
    } catch {
      setErr("駐車場情報の取得に失敗しました。時間をおいてもう一度試してください。");
    }
    stopProgress();
    setProgress(100);
    setBusy(false);
  };

  const sorted = result ? [...result.options].sort((a, b) => a.estimated_cost - b.estimated_cost) : [];

  return (
    <section className="mf-section">
      <SectionHead
        no="30"
        title="車移動"
        sub="行き先と時間帯を入力すると、徒歩や電車・バスとの組み合わせも含め、コスパの良い駐車方法をAIがWeb検索して複数パターン提案します。"
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
          {busy ? "検索中…（30秒ほどかかります）" : "コスパの良い駐車方法を調べる"}
        </button>
        {busy && (
          <>
            <div className="mf-bar">
              <div className="mf-barfill" style={{ width: `${progress}%`, background: "#4C9AFF" }} />
            </div>
            <div className="mf-numsub mf-mono" style={{ marginTop: 4 }}>
              {progress}%
            </div>
          </>
        )}
        {err && <div className="mf-hint" style={{ color: "#F26D5F" }}>{err}</div>}
      </div>

      {result && (
        <>
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
