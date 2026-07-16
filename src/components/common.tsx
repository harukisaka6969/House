"use client";

import { fmt } from "@/lib/judge";

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
