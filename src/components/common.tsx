"use client";

import { fmt } from "@/lib/judge";
import { useDashboard } from "./DashboardContext";

/** Recharts' Tooltip `formatter` prop types `value` as `ValueType | undefined` (string | number | array). */
export function fmtTooltip(value: unknown): string {
  return fmt(Number(value));
}

export const TT = {
  background: "#181E25",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#E7ECF2",
  fontSize: 12,
};

export function SectionHead({ no, title, sub }: { no: string; title: string; sub: string }) {
  return (
    <div className="mf-sechead">
      <span className="mf-secno">{no}</span>
      <div>
        <h2 className="mf-sectitle">{title}</h2>
        <div className="mf-secsub">{sub}</div>
      </div>
    </div>
  );
}

/** 「遥希」「アリサ」（本人・パートナーの実名）「家族全体」の3択。お金関連セクション共通の視点切替。
 * ownerFilterはprofile idで管理し、選ばれた名前をowner_nameと突き合わせるための名前も一緒に返す。 */
export function MoneyViewToggle() {
  const { me, ownerFilter, setOwnerFilter } = useDashboard();
  if (!me) return null;
  const meId = me.profile.id;
  const partner = me.partner;
  return (
    <div className="mf-chips" style={{ marginBottom: 12 }}>
      <button className={"mf-chipbtn" + (ownerFilter === meId ? " on" : "")} onClick={() => setOwnerFilter(meId)}>
        {me.profile.name}
      </button>
      {partner && (
        <button className={"mf-chipbtn" + (ownerFilter === partner.id ? " on" : "")} onClick={() => setOwnerFilter(partner.id)}>
          {partner.name}
        </button>
      )}
      <button className={"mf-chipbtn" + (ownerFilter === null ? " on" : "")} onClick={() => setOwnerFilter(null)}>
        家族全体
      </button>
    </div>
  );
}

/** ownerFilter（profile id）を、生の一覧データが持つowner_nameと突き合わせるための名前に変換する。
 * nullなら「家族全体」＝フィルタなし。 */
export function ownerFilterName(me: { profile: { id: string; name: string }; partner: { id: string; name: string } | null } | null, ownerFilter: string | null): string | null {
  if (!me || !ownerFilter) return null;
  if (ownerFilter === me.profile.id) return me.profile.name;
  if (me.partner && ownerFilter === me.partner.id) return me.partner.name;
  return null;
}

export function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string | null }) {
  return (
    <div className="mf-stat">
      <div className="mf-statlabel">{label}</div>
      <div className="mf-statvalue mf-mono" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mf-statsub mf-mono">{sub}</div>}
    </div>
  );
}
