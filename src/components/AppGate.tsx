"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * サーバー側のセッションCookieは有効でも、このタブ/ブラウザプロセスで一度もPINを
 * 通していなければロック画面に戻す。sessionStorageはバックグラウンド→復帰では消えず、
 * アプリが完全に終了して再起動されたとき（PWAの再起動含む）だけ消える性質を利用し、
 * 「開き直したら毎回PIN」「ホーム画面往復では聞かない」を両立させる。
 */
export default function AppGate({ slug, children }: { slug: string; children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(`unlocked:${slug}`) === "1") {
      setReady(true);
    } else {
      router.replace(`/${slug}`);
    }
  }, [slug, router]);

  if (!ready) {
    return (
      <div className="mf-empty" style={{ padding: 40, textAlign: "center" }}>
        読み込み中…
      </div>
    );
  }
  return <>{children}</>;
}
