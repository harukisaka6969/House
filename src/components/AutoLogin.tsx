"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiClientError } from "@/lib/apiClient";

/** ハルキ・アリサ用: PIN入力なしでセッションを確立し、今日の支出スワイプ画面へ進む。 */
export default function AutoLogin({ slug }: { slug: string }) {
  const router = useRouter();
  const [error, setError] = useState("");

  const go = () => {
    apiPost("/api/auth/auto-login", { slug })
      .then(() => {
        sessionStorage.setItem(`unlocked:${slug}`, "1");
        router.replace(`/${slug}/today`);
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "接続に失敗しました。"));
  };

  useEffect(() => {
    apiPost("/api/auth/auto-login", { slug })
      .then(() => {
        sessionStorage.setItem(`unlocked:${slug}`, "1");
        router.replace(`/${slug}/today`);
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "接続に失敗しました。"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (error) {
    return (
      <div className="mf-lockroot">
        <div className="mf-lockcard">
          <p className="mf-locksub">{error}</p>
          <button className="mf-lockbtn primary" onClick={go}>
            もう一度試す
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mf-lockroot">
      <div className="mf-lockcard">
        <p className="mf-locksub">読み込み中…</p>
      </div>
    </div>
  );
}
