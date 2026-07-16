"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { apiPost } from "@/lib/apiClient";

type Mode = "idle" | "pin";

const noopSubscribe = () => () => {};

/** WebAuthn support can only be known client-side; useSyncExternalStore keeps the SSR snapshot (false) and client snapshot in sync without a render-then-effect flash. */
function useWebauthnAvailable(): boolean {
  return useSyncExternalStore(noopSubscribe, browserSupportsWebAuthn, () => false);
}

export default function LockScreen({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const webauthnAvailable = useWebauthnAvailable();

  const goApp = () => router.push(`/${slug}/app`);

  const unlockWithPasskey = async () => {
    setError("");
    setBusy(true);
    try {
      const options = await apiPost<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
        "/api/auth/webauthn/login-options",
        { slug }
      );
      const response = await startAuthentication({ optionsJSON: options });
      await apiPost("/api/auth/webauthn/login-verify", { response });
      goApp();
    } catch {
      setError("Face ID / Touch IDでの解錠に失敗しました。PINをお試しください。");
    } finally {
      setBusy(false);
    }
  };

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
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length === 6) submitPin(next);
  };
  const backspace = () => setPin((p) => p.slice(0, -1));

  return (
    <div className="mf-lockroot">
      <div className="mf-lockcard">
        <div className="mf-lockavatar">{name.slice(0, 1)}</div>
        <h1 className="mf-lockname">{name}</h1>
        <p className="mf-locksub">ロックを解除してください</p>

        {mode === "idle" && (
          <>
            {webauthnAvailable && (
              <button className="mf-lockbtn primary" disabled={busy} onClick={unlockWithPasskey}>
                Face IDでロック解除
              </button>
            )}
            <button className="mf-lockbtn ghost" disabled={busy} onClick={() => { setMode("pin"); setError(""); }}>
              PINで解除
            </button>
          </>
        )}

        {mode === "pin" && (
          <>
            <div className="mf-pinpad">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className={"mf-pindot" + (i < pin.length ? " filled" : "")} />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
                k === "" ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    className="mf-lockbtn ghost"
                    style={{ marginBottom: 0, padding: "14px 0" }}
                    disabled={busy}
                    onClick={() => (k === "⌫" ? backspace() : pressDigit(k))}
                  >
                    {k}
                  </button>
                )
              )}
            </div>
            <button className="mf-lockbtn ghost" disabled={busy} onClick={() => { setMode("idle"); setPin(""); setError(""); }}>
              戻る
            </button>
          </>
        )}

        <div className="mf-lockerr">{error}</div>
      </div>
    </div>
  );
}
