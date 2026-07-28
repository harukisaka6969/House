"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/apiClient";

const MIN_PIN = 4;
const MAX_PIN = 8;

export default function LockScreen({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const goApp = () => router.push(`/${slug}/app`);

  const submitPin = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/auth/pin", { slug, pin: value });
      goApp();
    } catch (e) {
      const message = e instanceof Error ? e.message : "PINが違います";
      setError(message);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const pressDigit = (d: string) => {
    if (busy) return;
    setPin((p) => {
      if (p.length >= MAX_PIN) return p;
      const next = p + d;
      if (next.length === MAX_PIN) submitPin(next);
      return next;
    });
  };
  const backspace = () => setPin((p) => p.slice(0, -1));
  const confirm = () => {
    if (busy || pin.length < MIN_PIN) return;
    submitPin(pin);
  };

  // 物理キーボード（PC）からの数字入力にも対応する。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") pressDigit(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Enter") confirm();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, busy]);

  return (
    <div className="mf-lockroot">
      <div className="mf-lockcard">
        <div className="mf-lockavatar">{name.slice(0, 1)}</div>
        <h1 className="mf-lockname">{name}</h1>
        <p className="mf-locksub">ロックを解除してください</p>

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
      </div>
    </div>
  );
}
