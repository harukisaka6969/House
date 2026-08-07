"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiClientError } from "@/lib/apiClient";
import type { SwitchBotDeviceOut, SwitchBotDevicesResponse } from "@/lib/apiTypes";
import { SectionHead } from "../common";

const NO_CONTROL_TYPES = ["Hub", "Hub Mini", "Hub Plus", "Hub 2", "Meter", "Motion Sensor", "Contact Sensor", "Water Detector", "Indoor Cam"];

type Action = { label: string; command: string; parameter?: string };

function actionsFor(deviceType: string): Action[] {
  if (deviceType.includes("Curtain")) {
    return [
      { label: "開ける", command: "turnOn" },
      { label: "閉じる", command: "turnOff" },
      { label: "停止", command: "pause" },
    ];
  }
  if (deviceType.includes("Lock")) {
    return [
      { label: "解錠", command: "unlock" },
      { label: "施錠", command: "lock" },
    ];
  }
  if (deviceType.includes("Vacuum")) {
    return [
      { label: "開始", command: "start" },
      { label: "ドックへ戻る", command: "dock" },
    ];
  }
  if (deviceType === "Bot") {
    return [
      { label: "押す", command: "press" },
      { label: "ON", command: "turnOn" },
      { label: "OFF", command: "turnOff" },
    ];
  }
  if (NO_CONTROL_TYPES.some((t) => deviceType.includes(t))) return [];
  return [
    { label: "ON", command: "turnOn" },
    { label: "OFF", command: "turnOff" },
  ];
}

function statusLabel(status: Record<string, unknown> | null): string | null {
  if (!status) return null;
  if (typeof status.power === "string") return status.power === "on" ? "🟢 ON" : "⚪ OFF";
  if (typeof status.slidePosition === "number") return `位置 ${status.slidePosition}%`;
  if (typeof status.lockState === "string") return status.lockState;
  return null;
}

function DeviceRow({ device, busy, onCommand }: { device: SwitchBotDeviceOut; busy: boolean; onCommand: (deviceId: string, action: Action) => void }) {
  const actions = actionsFor(device.deviceType);
  const label = statusLabel(device.status);
  return (
    <div className="mf-shopitem">
      <div className="mf-row" style={{ gap: 10 }}>
        <span className="mf-shopname">{device.deviceName}</span>
        {label && <span className="mf-listcat">{label}</span>}
      </div>
      <div className="mf-row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        <span className="mf-hint" style={{ margin: 0 }}>
          {device.remoteType ?? device.deviceType}
        </span>
        {actions.length === 0 ? (
          <span className="mf-hint" style={{ margin: 0, opacity: 0.6 }}>
            操作なし
          </span>
        ) : (
          actions.map((a) => (
            <button
              key={a.label}
              className="mf-btn ghost"
              style={{ padding: "3px 8px", fontSize: 12 }}
              disabled={busy}
              onClick={() => onCommand(device.deviceId, a)}
            >
              {a.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function SmartHome() {
  const [data, setData] = useState<SwitchBotDevicesResponse | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    apiGet<SwitchBotDevicesResponse>("/api/switchbot/devices")
      .then((r) => {
        setData(r);
        setError("");
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "読み込みに失敗しました。"));
  };
  useEffect(load, []);

  const runCommand = async (deviceId: string, action: Action) => {
    setBusyId(deviceId);
    setMsg("");
    try {
      await apiPost(`/api/switchbot/devices/${deviceId}/command`, { command: action.command, parameter: action.parameter });
      setMsg(`✓ 「${action.label}」を送りました。`);
      setTimeout(load, 1500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "操作に失敗しました。");
    }
    setBusyId(null);
  };

  return (
    <section className="mf-section">
      <SectionHead no="21" title="家電" sub="SwitchBotに登録されている家電を操作します。" />

      {error && <div className="mf-empty">{error}</div>}
      {msg && (
        <div className="mf-hint" style={{ background: "#181E25", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px" }}>
          {msg}
        </div>
      )}

      {!error && !data && <div className="mf-empty">読み込み中…</div>}

      {data && (
        <>
          <div className="mf-panel">
            <div className="mf-paneltitle">デバイス（{data.devices.length}件）</div>
            {data.devices.length === 0 ? (
              <div className="mf-empty">SwitchBotアプリで登録されたデバイスが見つかりません。</div>
            ) : (
              <div className="mf-list" style={{ maxHeight: "none" }}>
                {data.devices.map((d) => (
                  <DeviceRow key={d.deviceId} device={d} busy={busyId === d.deviceId} onCommand={runCommand} />
                ))}
              </div>
            )}
          </div>

          {data.infraredRemotes.length > 0 && (
            <div className="mf-panel">
              <div className="mf-paneltitle">赤外線リモコン（{data.infraredRemotes.length}件）</div>
              <div className="mf-hint" style={{ marginTop: 0, opacity: 0.75 }}>
                Hub経由の学習リモコン（エアコン・テレビなど）。ON/OFFのみ試せます。
              </div>
              <div className="mf-list" style={{ maxHeight: "none" }}>
                {data.infraredRemotes.map((d) => (
                  <DeviceRow key={d.deviceId} device={d} busy={busyId === d.deviceId} onCommand={runCommand} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
