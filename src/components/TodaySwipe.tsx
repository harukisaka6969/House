"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import { breakdownYen, type DenominationCount } from "@/lib/moneyBreakdown";
import type { TodayExpenseSentimentOut } from "@/lib/apiTypes";

type SentimentValue = "good" | "bad";

const SWIPE_THRESHOLD_RATIO = 0.25;
const MAX_ICONS = 10;
const FLING_MS = 320;

export default function TodaySwipe({ slug }: { slug: string }) {
  const router = useRouter();
  const [data, setData] = useState<TodayExpenseSentimentOut | null>(null);
  const [recorded, setRecorded] = useState<SentimentValue | null>(null);
  const [reswiping, setReswiping] = useState(false);

  useEffect(() => {
    apiGet<TodayExpenseSentimentOut>("/api/expense-sentiment/today")
      .then(setData)
      .catch(() => setData({ date: "", hasExpenses: false, total: 0, sentiment: null }));
  }, []);

  const submit = async (sentiment: SentimentValue) => {
    setRecorded(sentiment);
    setReswiping(false);
    try {
      await apiPost("/api/expense-sentiment", { sentiment });
    } catch {
      // 記録に失敗しても画面上は完了表示のまま（再スワイプで再試行できる）。
    }
  };

  const openDashboard = () => router.push(`/${slug}/app`);

  if (!data) {
    return (
      <div className="ts-root">
        <div className="ts-loading">読み込み中…</div>
      </div>
    );
  }

  if (!data.hasExpenses) {
    return (
      <div className="ts-root">
        <div className="ts-zero">今日は支出がまだないね👍</div>
        <button className="ts-dashlink" onClick={openDashboard}>
          ダッシュボードを開く →
        </button>
      </div>
    );
  }

  const shown = recorded ?? data.sentiment;
  if (shown && !reswiping) {
    return (
      <div className="ts-root">
        <div className="ts-done">
          <div className="ts-doneicon">{shown === "good" ? "👍" : "💭"}</div>
          <div className="ts-donetext">記録したよ！</div>
          <div className="ts-donesub">
            今日の支出（{fmt(data.total)}）は{shown === "good" ? "良い出費" : "無駄な出費"}だったと記録したよ
          </div>
          <button className="ts-relink" onClick={() => setReswiping(true)}>
            もう一度スワイプする
          </button>
          <button className="ts-dashlink" onClick={openDashboard}>
            ダッシュボードを開く →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-root">
      <SwipeCard total={data.total} onSwipe={submit} />
      <button className="ts-dashlink" onClick={openDashboard}>
        ダッシュボードを開く →
      </button>
    </div>
  );
}

function SwipeCard({ total, onSwipe }: { total: number; onSwipe: (s: SentimentValue) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const goodHintRef = useRef<HTMLDivElement>(null);
  const badHintRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startX: 0, dx: 0, dragging: false });
  const [busy, setBusy] = useState(false);

  const applyTransform = (dx: number, animate: boolean) => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transition = animate ? "transform 0.3s ease, opacity 0.3s ease" : "none";
    const rotate = Math.max(-18, Math.min(18, dx / 12));
    card.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;
    const progress = Math.min(Math.abs(dx) / (card.offsetWidth * SWIPE_THRESHOLD_RATIO), 1);
    if (goodHintRef.current) goodHintRef.current.style.opacity = dx > 0 ? String(progress) : "0";
    if (badHintRef.current) badHintRef.current.style.opacity = dx < 0 ? String(progress) : "0";
  };

  const flingOut = (dir: SentimentValue) => {
    setBusy(true);
    const card = cardRef.current;
    if (card) {
      card.style.transition = "transform 0.35s ease, opacity 0.35s ease";
      card.style.transform = `translateX(${dir === "good" ? 640 : -640}px) rotate(${dir === "good" ? 30 : -30}deg)`;
      card.style.opacity = "0";
    }
    window.setTimeout(() => onSwipe(dir), FLING_MS);
  };

  const finishDrag = () => {
    if (!drag.current.dragging) return;
    drag.current.dragging = false;
    const width = cardRef.current?.offsetWidth ?? 320;
    if (Math.abs(drag.current.dx) > width * SWIPE_THRESHOLD_RATIO) {
      flingOut(drag.current.dx > 0 ? "good" : "bad");
    } else {
      applyTransform(0, true);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, dx: 0, dragging: true };
    applyTransform(0, false);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.dragging) return;
    drag.current.dx = e.clientX - drag.current.startX;
    applyTransform(drag.current.dx, false);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === "ArrowRight") flingOut("good");
      else if (e.key === "ArrowLeft") flingOut("bad");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  return (
    <div className="ts-cardwrap">
      <div
        ref={cardRef}
        className="ts-card"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div className="ts-hint ts-hint-good" ref={goodHintRef}>
          GOOD
        </div>
        <div className="ts-hint ts-hint-bad" ref={badHintRef}>
          BAD
        </div>
        <div className="ts-label">今日の支出</div>
        <div className="ts-amount">{fmt(total)}</div>
        <div className="ts-bills">
          {breakdownYen(total).map((d) => (
            <DenomRow key={d.value} d={d} />
          ))}
        </div>
        <div className="ts-swipehint">良いと思ったら右、無駄だったら左にスワイプ</div>
      </div>
    </div>
  );
}

// 実際の日本のお金の見た目に寄せる: 5円・50円玉は穴あき、500円は金色、10円は銅色、など。
const COIN_STYLE: Record<number, { fill: string; hole: boolean }> = {
  1: { fill: "#C7CBD1", hole: false }, // アルミ・銀白色
  5: { fill: "#C6A15B", hole: true }, // 黄銅・金色、穴あき
  10: { fill: "#B36A3E", hole: false }, // 青銅・銅色
  50: { fill: "#BFC3C9", hole: true }, // 白銅・銀色、穴あき
  100: { fill: "#C9CDD3", hole: false }, // 白銅・銀色
  500: { fill: "#C9A227", hole: false }, // ニッケル黄銅・金色
};
const BILL_STYLE: Record<number, string> = {
  1000: "#3E6DA6", // 青
  5000: "#8B4A8F", // 紫
  10000: "#8C6A3F", // 茶
};

function CoinIcon({ value }: { value: number }) {
  const style = COIN_STYLE[value] ?? { fill: "#C9CDD3", hole: false };
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="8" fill={style.fill} stroke="rgba(0,0,0,0.3)" strokeWidth="0.75" />
      {style.hole && <circle cx="9" cy="9" r="2.8" fill="#101418" />}
    </svg>
  );
}

function BillIcon({ value }: { value: number }) {
  const fill = BILL_STYLE[value] ?? "#3E6DA6";
  return (
    <svg width="28" height="17" viewBox="0 0 28 17" aria-hidden="true">
      <rect x="0.5" y="0.5" width="27" height="16" rx="2" fill={fill} stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" />
      <circle cx="20.5" cy="8.5" r="4.5" fill="rgba(255,255,255,0.18)" />
    </svg>
  );
}

function DenomRow({ d }: { d: DenominationCount }) {
  const shownCount = Math.min(d.count, MAX_ICONS);
  return (
    <div className="ts-denomrow">
      <span className="ts-denomicons">
        {Array.from({ length: shownCount }).map((_, i) => (
          <span key={i} className="ts-denomicon">
            {d.kind === "bill" ? <BillIcon value={d.value} /> : <CoinIcon value={d.value} />}
          </span>
        ))}
      </span>
      <span className="ts-denomlabel">
        ¥{d.value.toLocaleString()}
        {d.count > 1 ? ` ×${d.count}` : ""}
      </span>
    </div>
  );
}
