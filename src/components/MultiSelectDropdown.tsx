"use client";

import { useEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
  color?: string;
}

/** 複数選択できるドロップダウン。何も選んでいないときは「全て」扱い。外側をタップすると閉じる。 */
export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const summary =
    selected.length === 0
      ? "全て"
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length}件選択`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={"mf-chipbtn" + (selected.length > 0 ? " on" : "")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}: {summary} ▾
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            minWidth: 200,
            maxWidth: "min(320px, calc(100vw - 32px))",
            maxHeight: 300,
            overflowY: "auto",
            background: "#181E25",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {options.length === 0 ? (
            <div className="mf-hint" style={{ margin: 6 }}>この月には該当がありません。</div>
          ) : (
            options.map((o) => (
              <label
                key={o.value}
                role="option"
                aria-selected={selected.includes(o.value)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 6px", cursor: "pointer", fontSize: 13.5, color: "#E7ECF2" }}
              >
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                {o.color && <span className="mf-dot" style={{ background: o.color }} />}
                <span style={{ flex: 1 }}>{o.label}</span>
                {o.count !== undefined && <span className="mf-mono" style={{ color: "#93A0AE", fontSize: 12 }}>{o.count}</span>}
              </label>
            ))
          )}
          {selected.length > 0 && (
            <button type="button" className="mf-btn ghost" style={{ width: "100%", marginTop: 4, padding: "6px 10px", fontSize: 12.5 }} onClick={() => onChange([])}>
              選択を解除
            </button>
          )}
        </div>
      )}
    </div>
  );
}
