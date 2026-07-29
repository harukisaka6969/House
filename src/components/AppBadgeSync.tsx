"use client";

import { useEffect } from "react";
import { apiGet } from "@/lib/apiClient";

/** ホーム画面アイコンのバッジを、承認待ち・承認済み・食事ログ新着の合計件数で更新する（Badging API対応環境のみ）。 */
export default function AppBadgeSync() {
  useEffect(() => {
    if (typeof navigator.setAppBadge !== "function") return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const r = await apiGet<{ total: number }>("/api/notifications/count");
        if (cancelled) return;
        if (r.total > 0) await navigator.setAppBadge(r.total);
        else if (typeof navigator.clearAppBadge === "function") await navigator.clearAppBadge();
      } catch {
        // Badging APIやネットワークの一時的な失敗は無視する。
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
