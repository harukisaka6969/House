"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/apiClient";
import { isValidPatternSequence, patternToCode } from "@/lib/pattern";
import PatternGrid from "@/components/PatternGrid";

const MIN_PIN = 4;
const MAX_PIN = 8;

export default function LockScreen({
  slug,
  name,
  authMethod,
}: {
  slug: string;
  name: string;
  authMethod: "pin" | "pattern";
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [patternResetSignal, setPatternResetSignal] = useState(0);

  // このタブ/プロセスで既にPINを通していれば（バックグラウンド→復帰など）再度聞かない。
  // アプリが完全に終了して再起動された場合はsessionStorageが消えているので、この効果はスキップされ通常通りロック画面が出る。
  useEffect(() => {
    if (sessionStorage.getItem(`unlocked:${slug}`) === "1") {
      router.replace(`/${slug}/app`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const submitCredential = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await apiPost<{ profile: { role: "owner" | "family" | "kiosk" } }>("/api/auth/pin", {
        slug,
        pin: value,
      });
      sessionStorage.setItem(`unlocked:${slug}`, "1");

      if (res.profile.role === "owner") {
        const pending = await apiGet<{ pending: boolean }>("/api/expense-sentiment/pending").catch(() => null);
        if (pending?.pending) {
          router.push(`/${slug}/today`);
          return;
        }
      }
      router.push(`/${slug}/app`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "認証に失敗しました";
      setError(message);
      setPin("");
      setPatternResetSignal((s) => s + 1);
    } finally {
      setBusy(false);
    }
  };

  const pressDigit = (d: string) => {
    if (busy) return;
    setPin((p) => {
      if (p.length >= MAX_PIN) return p;
      const next = p + d;
      if (next.length === MAX_PIN) submitCredential(next);
      return next;
    });
  };
  const backspace = () => setPin((p) => p.slice(0, -1));
  const confirm = () => {
    if (busy || pin.length < MIN_PIN) return;
    submitCredential(pin);
  };

  // 物理キーボード（PC）からの数字入力にも対応する（PINのときのみ）。
  useEffect(() => {
    if (authMethod !== "pin") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") pressDigit(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Enter") confirm();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMethod, pin, busy]);

  const onPatternComplete = (nodes: number[]) => {
    if (busy) return;
    if (!isValidPatternSequence(nodes)) {
      setError("4つ以上の点を、通る順につなげてください");
      setPatternResetSignal((s) => s + 1);
      return;
    }
    submitCredential(patternToCode(nodes));
  };

  return (
    <div className="mf-lockroot">
      <div className="mf-lockcard">
        <div className="mf-lockavatar">{name.slice(0, 1)}</div>
        <h1 className="mf-lockname">{name}</h1>
        <p className="mf-locksub">ロックを解除してください</p>

        {authMethod === "pattern" ? (
          <>
            <PatternGrid
              key={patternResetSignal}
              onComplete={onPatternComplete}
              disabled={busy}
              hint="4つ以上の点をなぞってパターンを入力"
            />
            <div className="mf-lockerr" style={{ marginTop: 10 }}>
              {error}
            </div>
          </>
        ) : (
          <>
            <div className="mf-pinpad">
              {Array.from({ length: Math.max(pin.length, MIN_PIN) }).map((_, i) => (
                <span key={i} className={"mf-pindot" + (i < pin.length ? " filled" : "")} />
              ))}
            </div>
            <p className="mf-locksub" style={{ marginTop: -8, marginBottom: 12 }}>
              {MIN_PIN}〜{MAX_PIN}桁のPINを入力し、✓で確定（キーボードのEnterでも可）
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"].map((k, i) => (
                <button
                  key={i}
                  className="mf-lockbtn ghost"
                  style={{ marginBottom: 0, padding: "14px 0" }}
                  disabled={busy || (k === "✓" && pin.length < MIN_PIN)}
                  onClick={() => (k === "⌫" ? backspace() : k === "✓" ? confirm() : pressDigit(k))}
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="mf-lockerr">{error}</div>
          </>
        )}
      </div>
    </div>
  );
}
