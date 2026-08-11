"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import { breakdownYen, type DenominationCount } from "@/lib/moneyBreakdown";
import type { TodayExpenseSentimentOut } from "@/lib/apiTypes";

type SentimentValue = "good" | "bad";

const SWIPE_THRESHOLD_RATIO = 0.25;
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
        <MoneyScene total={total} />
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

function CoinIcon({ value, size = 18 }: { value: number; size?: number }) {
  const style = COIN_STYLE[value] ?? { fill: "#C9CDD3", hole: false };
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="8" fill={style.fill} stroke="rgba(0,0,0,0.3)" strokeWidth="0.75" />
      {style.hole && <circle cx="9" cy="9" r="2.8" fill="#101418" />}
    </svg>
  );
}

function BillIcon({ value, width = 28, height = 17 }: { value: number; width?: number; height?: number }) {
  const fill = BILL_STYLE[value] ?? "#3E6DA6";
  return (
    <svg width={width} height={height} viewBox="0 0 28 17" aria-hidden="true">
      <rect x="0.5" y="0.5" width="27" height="16" rx="2" fill={fill} stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" />
      <circle cx="20.5" cy="8.5" r="4.5" fill="rgba(255,255,255,0.18)" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="ts-walletsvg" width="216" height="126" viewBox="0 0 216 126" aria-hidden="true">
      <path d="M6 46 Q108 10 210 46 L210 58 Q108 26 6 58 Z" fill="#4A3626" />
      <rect x="6" y="34" width="204" height="88" rx="13" fill="#3B2A1E" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
      <rect x="6" y="34" width="204" height="88" rx="13" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <rect x="150" y="66" width="46" height="32" rx="4" fill="#2E2018" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
      <line x1="150" y1="82" x2="196" y2="82" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
    </svg>
  );
}

const MAX_FAN_BILLS = 6;
const MAX_PILE_COINS = 12;
const FAN_STEP = 11;
const FAN_BASE_TILT = -7;

function flattenByKind(breakdown: DenominationCount[], kind: DenominationCount["kind"], max: number): number[] {
  const out: number[] = [];
  for (const d of breakdown) {
    if (d.kind !== kind) continue;
    for (let i = 0; i < d.count && out.length < max; i++) out.push(d.value);
  }
  return out;
}

function countOfKind(breakdown: DenominationCount[], kind: DenominationCount["kind"]): number {
  return breakdown.filter((d) => d.kind === kind).reduce((s, d) => s + d.count, 0);
}

function MoneyScene({ total }: { total: number }) {
  const breakdown = breakdownYen(total);
  const bills = flattenByKind(breakdown, "bill", MAX_FAN_BILLS);
  const coins = flattenByKind(breakdown, "coin", MAX_PILE_COINS);
  const billOverflow = countOfKind(breakdown, "bill") - bills.length;
  const coinOverflow = countOfKind(breakdown, "coin") - coins.length;
  const n = bills.length;

  return (
    <div className="ts-moneyscene">
      {bills.length > 0 && (
        <div className="ts-billfan">
          {bills.map((value, i) => {
            const angle = FAN_BASE_TILT + (i - (n - 1) / 2) * FAN_STEP;
            return (
              <div
                key={i}
                className="ts-billfan-item"
                style={{ transform: `rotate(${angle}deg) translateY(-${i * 3}px)`, zIndex: i }}
              >
                <BillIcon value={value} width={74} height={45} />
              </div>
            );
          })}
          {billOverflow > 0 && <div className="ts-fanmore">+{billOverflow}</div>}
        </div>
      )}
      <WalletIcon />
      {coins.length > 0 && (
        <div className="ts-coinpile">
          {coins.map((value, i) => {
            const jx = ((i * 37) % 61) - 30;
            const jy = ((i * 53) % 21) - 10;
            const rot = ((i * 29) % 40) - 20;
            return (
              <div
                key={i}
                className="ts-coinpile-item"
                style={{
                  left: `calc(50% + ${jx}px)`,
                  bottom: `${8 + Math.max(0, jy)}px`,
                  transform: `rotate(${rot}deg)`,
                  zIndex: 10 + i,
                }}
              >
                <CoinIcon value={value} size={28} />
              </div>
            );
          })}
          {coinOverflow > 0 && <div className="ts-pilemore">+{coinOverflow}</div>}
        </div>
      )}
      <div className="ts-moneycaption">
        {breakdown.map((d) => (
          <span key={d.value} className="ts-moneycaption-item">
            ¥{d.value.toLocaleString()}×{d.count}
          </span>
        ))}
      </div>
    </div>
  );
}
