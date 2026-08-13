"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { nowMonthKeyJST, shiftMonth } from "@/lib/date";
import { CATEGORIES } from "@/lib/constants";
import type { MeResponse, MonthResponse, SettingsResponse, TrendPoint, InventoryItemOut } from "@/lib/apiTypes";

interface DashboardState {
  slug: string;
  me: MeResponse | null;
  /** お金関連セクション共通の「誰の視点で見るか」フィルタ。nullは家族全体（世帯合計）。 */
  ownerFilter: string | null;
  setOwnerFilter: (owner: string | null) => void;
  monthKey: string;
  setMonthKey: (m: string) => void;
  month: MonthResponse | null;
  prevMonth: MonthResponse | null;
  trend: TrendPoint[];
  settings: SettingsResponse | null;
  allCats: string[];
  loading: boolean;
  refreshMonth: () => void;
  refreshSettings: () => void;
  refreshMe: () => void;
  agentOpen: boolean;
  setAgentOpen: (open: boolean) => void;
  advisorExtraContext: string | null;
  openAdvisorWithContext: (context: string) => void;
  clearAdvisorExtraContext: () => void;
  lowStockItems: InventoryItemOut[];
  refreshLowStock: () => void;
}

const Ctx = createContext<DashboardState | null>(null);

export function DashboardProvider({
  slug,
  initialMe,
  children,
}: {
  slug: string;
  initialMe?: MeResponse | null;
  children: React.ReactNode;
}) {
  const [me, setMe] = useState<MeResponse | null>(initialMe ?? null);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState(nowMonthKeyJST());
  const [month, setMonth] = useState<MonthResponse | null>(null);
  const [prevMonth, setPrevMonth] = useState<MonthResponse | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [monthTick, setMonthTick] = useState(0);
  const [settingsTick, setSettingsTick] = useState(0);
  const [agentOpen, setAgentOpen] = useState(false);
  const [advisorExtraContext, setAdvisorExtraContext] = useState<string | null>(null);
  const [lowStockItems, setLowStockItems] = useState<InventoryItemOut[]>([]);
  const [lowStockTick, setLowStockTick] = useState(0);

  useEffect(() => {
    if (initialMe) return;
    apiGet<MeResponse>("/api/auth/me").then(setMe).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ownerQs = ownerFilter ? `&owner=${ownerFilter}` : "";
    apiGet<{ trend: TrendPoint[] }>(`/api/trend?${ownerQs.slice(1)}`).then((r) => setTrend(r.trend)).catch(() => {});
  }, [monthTick, ownerFilter]);

  useEffect(() => {
    let cancelled = false;
    const ownerQs = ownerFilter ? `&owner=${ownerFilter}` : "";
    Promise.all([
      apiGet<MonthResponse>(`/api/month?m=${monthKey}${ownerQs}`),
      apiGet<MonthResponse>(`/api/month?m=${shiftMonth(monthKey, -1)}${ownerQs}`),
    ]).then(([cur, prev]) => {
      if (cancelled) return;
      setMonth(cur);
      setPrevMonth(prev);
    });
    return () => {
      cancelled = true;
    };
  }, [monthKey, monthTick, ownerFilter]);

  // 導出値: 表示中の月とmonthKeyが一致するまで（初回・月切替の直後）ローディング扱い
  const loading = !month || month.month !== monthKey;

  useEffect(() => {
    apiGet<SettingsResponse>("/api/settings").then(setSettings).catch(() => {});
  }, [settingsTick]);

  useEffect(() => {
    apiGet<{ items: InventoryItemOut[] }>("/api/inventory/low-stock").then((r) => setLowStockItems(r.items)).catch(() => {});
  }, [lowStockTick]);

  const refreshMonth = useCallback(() => setMonthTick((t) => t + 1), []);
  const refreshSettings = useCallback(() => setSettingsTick((t) => t + 1), []);
  const refreshLowStock = useCallback(() => setLowStockTick((t) => t + 1), []);
  const refreshMe = useCallback(() => {
    apiGet<MeResponse>("/api/auth/me").then(setMe).catch(() => {});
  }, []);
  const openAdvisorWithContext = useCallback((context: string) => {
    setAdvisorExtraContext(context);
    setAgentOpen(true);
  }, []);
  const clearAdvisorExtraContext = useCallback(() => setAdvisorExtraContext(null), []);

  const allCats = useMemo(() => {
    return settings?.allCategories ?? [...CATEGORIES.filter((c) => c !== "その他"), "その他"];
  }, [settings]);

  const value: DashboardState = {
    slug,
    me,
    ownerFilter,
    setOwnerFilter,
    monthKey,
    setMonthKey,
    month,
    prevMonth,
    trend,
    settings,
    allCats,
    loading,
    refreshMonth,
    refreshSettings,
    refreshMe,
    agentOpen,
    setAgentOpen,
    advisorExtraContext,
    openAdvisorWithContext,
    clearAdvisorExtraContext,
    lowStockItems,
    refreshLowStock,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboard(): DashboardState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
