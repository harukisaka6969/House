"use client";

import { useRef, useState } from "react";

const GRID = 3;
const NODE_COUNT = GRID * GRID;
const HIT_RADIUS_RATIO = 0.16;

interface PatternGridProps {
  onComplete: (nodes: number[]) => void;
  disabled?: boolean;
  size?: number;
  hint?: string;
}

function nodeCenter(id: number, size: number): { x: number; y: number } {
  const idx = id - 1;
  const col = idx % GRID;
  const row = Math.floor(idx / GRID);
  return { x: ((col + 0.5) / GRID) * size, y: ((row + 0.5) / GRID) * size };
}

/** 対応端末（主にAndroid）では点に触れるたびに短くバイブレーションさせる。iOS Safari等、
 * navigator.vibrateがない環境では何もしない（例外を投げる環境もあるためtry/catchで無視）。 */
function vibrateTick() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // 対応していない環境では無視する。
  }
}

/** Android風の9点パターンロック入力。指/マウスのドラッグで点を繋ぐ。
 * ドラッグ完了時に通過した点の並び（onComplete）を返すだけで、桁数などの検証は呼び出し側が行う。
 * 描画中のパターンを外部から強制的にクリアしたい場合は、呼び出し側で`key`を変えて再マウントさせること。 */
export default function PatternGrid({ onComplete, disabled, size = 300, hint }: PatternGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<SVGLineElement>(null);
  const draggingRef = useRef(false);
  const pathRef = useRef<number[]>([]);
  const [path, setPath] = useState<number[]>([]);
  const [justReleased, setJustReleased] = useState(false);

  const localPoint = (e: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const nearestNode = (pt: { x: number; y: number }): number | null => {
    const hitR = size * HIT_RADIUS_RATIO;
    let best: number | null = null;
    let bestDist = Infinity;
    for (let id = 1; id <= NODE_COUNT; id++) {
      if (pathRef.current.includes(id)) continue;
      const c = nodeCenter(id, size);
      const d = Math.hypot(pt.x - c.x, pt.y - c.y);
      if (d <= hitR && d < bestDist) {
        best = id;
        bestDist = d;
      }
    }
    return best;
  };

  const updateTrail = (pt: { x: number; y: number }) => {
    const line = trailRef.current;
    if (!line) return;
    if (pathRef.current.length === 0) {
      line.style.opacity = "0";
      return;
    }
    const last = nodeCenter(pathRef.current[pathRef.current.length - 1], size);
    line.setAttribute("x1", String(last.x));
    line.setAttribute("y1", String(last.y));
    line.setAttribute("x2", String(pt.x));
    line.setAttribute("y2", String(pt.y));
    line.style.opacity = "1";
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setJustReleased(false);
    const pt = localPoint(e);
    const hit = nearestNode(pt);
    pathRef.current = hit ? [hit] : [];
    setPath(pathRef.current);
    if (hit) vibrateTick();
    updateTrail(pt);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const pt = localPoint(e);
    const hit = nearestNode(pt);
    if (hit) {
      pathRef.current = [...pathRef.current, hit];
      setPath(pathRef.current);
      vibrateTick();
    }
    updateTrail(pt);
  };

  const finish = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (trailRef.current) trailRef.current.style.opacity = "0";
    const final = pathRef.current;
    pathRef.current = [];
    setPath([]);
    // 指を離した瞬間に点を消し、「入力を受け取った」ことが一目で分かるようにする。
    // 誤った/短すぎるパターンで再入力させる場合は呼び出し側がkeyを変えて再マウントさせるので、
    // その際に自然と表示が戻る。
    if (final.length > 0) {
      setJustReleased(true);
      onComplete(final);
    }
  };

  const polyline = path.map((id) => {
    const c = nodeCenter(id, size);
    return `${c.x},${c.y}`;
  });

  return (
    <div className="pg-wrap">
      <div
        ref={containerRef}
        className={"pg-grid" + (justReleased ? " pg-released" : "")}
        style={{ width: size, height: size, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <svg className="pg-svg" width={size} height={size}>
          {polyline.length > 1 && <polyline points={polyline.join(" ")} className="pg-line" />}
          <line ref={trailRef} className="pg-line" style={{ opacity: 0 }} />
        </svg>
        {Array.from({ length: NODE_COUNT }, (_, i) => i + 1).map((id) => {
          const c = nodeCenter(id, size);
          return (
            <div
              key={id}
              className={"pg-dot" + (path.includes(id) ? " active" : "")}
              style={{ left: c.x, top: c.y }}
            />
          );
        })}
      </div>
      {hint && <p className="pg-hint">{hint}</p>}
    </div>
  );
}
