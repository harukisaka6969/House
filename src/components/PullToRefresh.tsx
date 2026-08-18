"use client";

import { useRef, useState } from "react";

const THRESHOLD = 64;
const MAX_PULL = 96;
const RESISTANCE = 0.5;
const MIN_SPIN_MS = 500;

/** ページの一番上でしか反応しない、素朴な指追従型のプルリフレッシュ。ネイティブのバウンス/リフレッシュとは
 * overscroll-behavior側で棲み分ける（globals.cssでhtml,bodyに設定済み）ので、ここではpreventDefaultは
 * 呼ばない。onRefreshは呼びっぱなしでよく、実際のデータ取得が終わるより先にスピナーを消してよい
 * （各セクション側の読み込み中表示に引き継がれるため）が、体感のために最低表示時間だけは確保する。 */
export default function PullToRefresh({ onRefresh, children }: { onRefresh: () => void | Promise<void>; children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (refreshing) return;
    setSnapping(false);
    startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    pulling.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || refreshing) return;
    if (window.scrollY > 0) {
      startY.current = null;
      pulling.current = false;
      setPull(0);
      return;
    }
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      pulling.current = false;
      setPull(0);
      return;
    }
    pulling.current = true;
    setPull(Math.min(dy * RESISTANCE, MAX_PULL));
  };

  const onTouchEnd = async () => {
    startY.current = null;
    if (!pulling.current) {
      setPull(0);
      return;
    }
    const triggered = pull >= THRESHOLD;
    pulling.current = false;
    setSnapping(true);
    if (!triggered) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    setPull(THRESHOLD);
    const started = Date.now();
    try {
      await onRefresh();
    } finally {
      const remaining = MIN_SPIN_MS - (Date.now() - started);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      setRefreshing(false);
      setSnapping(true);
      setPull(0);
    }
  };

  const progress = Math.min(pull / THRESHOLD, 1);

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div className="mf-ptr" style={{ height: pull, transition: snapping ? "height 0.25s ease" : "none" }} aria-hidden={pull === 0 && !refreshing}>
        <span className={"mf-ptricon" + (refreshing ? " spin" : "")} style={{ opacity: refreshing ? 1 : progress, transform: refreshing ? undefined : `rotate(${progress * 180}deg)` }}>
          {refreshing ? "⟳" : "↓"}
        </span>
      </div>
      {children}
    </div>
  );
}
