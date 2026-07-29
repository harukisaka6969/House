"use client";

import { useEffect } from "react";
import { apiGet } from "@/lib/apiClient";

/** ホーム画面アイコンのバッジを、承認待ち・承認済み・食事ログ新着の合計件数で更新する（Badging API対応環境のみ）。 */
export default function AppBadgeSync() {
  useEffect(() => {
    if (typeof navigator.setAppBadge !== "function") {
      console.warn("[AppBadgeSync] このブラウザ/起動状態はBadging APIに対応していません（ホーム画面に追加したアプリからの起動が必要です）。");
      return;
    }
    let cancelled = false;

    const refresh = async () => {
      try {
        const r = await apiGet<{ total: number }>("/api/notifications/count");
        if (cancelled) return;
        if (r.total > 0) await navigator.setAppBadge(r.total);
        else if (typeof navigator.clearAppBadge === "function") await navigator.clearAppBadge();
      } catch (e) {
        console.warn("[AppBadgeSync] バッジ更新に失敗しました:", e);
      }
    };

    refresh();
    const interval = setInterval(refresh, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
