"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, ApiClientError } from "@/lib/apiClient";
import type { SwitchBotDeviceOut, SwitchBotDevicesResponse } from "@/lib/apiTypes";
import { SectionHead } from "../common";

const NO_CONTROL_TYPES = ["Hub", "Hub Mini", "Hub Plus", "Hub 2", "Meter", "Motion Sensor", "Contact Sensor", "Water Detector", "Indoor Cam"];
const UNASSIGNED = "__unassigned__";

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

/** デバイス名から部屋名の当てずっぽうを作る（割り当て未設定デバイスの入力補助用）。 */
function guessRoom(name: string): string {
  return name
    .replace(/\b(lights?|air ?conditioner|hub( mini| ?2| ?plus)?|sensors?|locks?|meters?|temperature|vacuum ?cleaner|remotes?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function DeviceRow({
  device,
  busy,
  onCommand,
  editing,
  onToggleEdit,
  onSaveRoom,
  roomOptions,
}: {
  device: SwitchBotDeviceOut;
  busy: boolean;
  onCommand: (deviceId: string, action: Action) => void;
  editing: boolean;
  onToggleEdit: () => void;
  onSaveRoom: (room: string | null) => void;
  roomOptions: string[];
}) {
  const actions = actionsFor(device.deviceType);
  const label = statusLabel(device.status);
  const [roomInput, setRoomInput] = useState(device.room ?? guessRoom(device.deviceName));

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
        <button className="mf-btn ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={onToggleEdit}>
          🏠 {device.room ? "部屋を変更" : "部屋に追加"}
        </button>
      </div>
      {editing && (
        <div className="mf-row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <input
            className="mf-input"
            style={{ flex: 1, minWidth: 140 }}
            list="switchbot-room-options"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            placeholder="部屋名（例: リビング）"
          />
          <datalist id="switchbot-room-options">
            {roomOptions.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <button className="mf-btn primary" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => onSaveRoom(roomInput)}>
            保存
          </button>
          {device.room && (
            <button className="mf-btn ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => onSaveRoom(null)}>
              割り当て解除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SmartHome() {
  const [data, setData] = useState<SwitchBotDevicesResponse | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [textIn, setTextIn] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [textMsg, setTextMsg] = useState("");

  const load = () => {
    apiGet<SwitchBotDevicesResponse>("/api/switchbot/devices")
      .then((r) => {
        setData(r);
        setError("");
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "読み込みに失敗しました。"));
  };
  useEffect(load, []);

  const allItems = useMemo(() => (data ? [...data.devices, ...data.infraredRemotes] : []), [data]);
  const roomOptions = useMemo(() => Array.from(new Set(allItems.map((d) => d.room).filter((r): r is string => !!r))).sort(), [allItems]);

  const grouped = useMemo(() => {
    const map = new Map<string, SwitchBotDeviceOut[]>();
    for (const item of allItems) {
      const key = item.room ?? UNASSIGNED;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [allItems]);

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

  const saveRoom = async (deviceId: string, room: string | null) => {
    await apiPost(`/api/switchbot/devices/${deviceId}/room`, { room });
    setEditingId(null);
    load();
  };

  const runText = async () => {
    if (!textIn.trim() || textBusy) return;
    setTextBusy(true);
    setTextMsg("");
    try {
      const r = await apiPost<{ message: string }>("/api/switchbot/command-text", { text: textIn.trim() });
      setTextMsg(r.message);
      setTextIn("");
    } catch (e) {
      setTextMsg(e instanceof Error ? e.message : "操作に失敗しました。");
    }
    setTextBusy(false);
  };

  const roomEntries = Array.from(grouped.entries())
    .filter(([room]) => room !== UNASSIGNED)
    .sort(([a], [b]) => a.localeCompare(b));
  const unassigned = grouped.get(UNASSIGNED) ?? [];

  return (
    <section className="mf-section">
      <SectionHead
        no="21"
        title="家電"
        sub="SwitchBotに登録されている家電を、部屋ごとにまとめて操作します。条件付きの自動化（シーン）そのものの作成はSwitchBotアプリでのみ可能ですが、作成済みのシーンをここから実行することはできます。"
      />

      <div className="mf-panel">
        <div className="mf-paneltitle">テキストで操作する</div>
        <div className="mf-hint" style={{ marginTop: 0, opacity: 0.75 }}>
          「リビングの照明つけて」「玄関の鍵を開けて」「おやすみモード」のように送ると、AIが該当するデバイス・シーンを判断して操作します（LINEのトークからも同じように操作できます）。
        </div>
        <div className="mf-row" style={{ marginTop: 6 }}>
          <input
            className="mf-input"
            style={{ flex: 1 }}
            placeholder="例: リビングの照明つけて"
            value={textIn}
            onChange={(e) => setTextIn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runText();
            }}
          />
          <button className="mf-btn primary" disabled={textBusy || !textIn.trim()} onClick={runText}>
            {textBusy ? "実行中…" : "送信"}
          </button>
        </div>
        {textMsg && <div className="mf-hint">{textMsg}</div>}
      </div>

      {error && <div className="mf-empty">{error}</div>}
      {msg && (
        <div className="mf-hint" style={{ background: "#181E25", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px" }}>
          {msg}
        </div>
      )}

      {!error && !data && <div className="mf-empty">読み込み中…</div>}

      {data && allItems.length === 0 && <div className="mf-empty">SwitchBotアプリで登録されたデバイスが見つかりません。</div>}

      {data && roomEntries.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
          {roomEntries.map(([room, items]) => (
            <div key={room} className="mf-panel" style={{ marginTop: 0 }}>
              <div className="mf-paneltitle">🚪 {room}</div>
              <div className="mf-list" style={{ maxHeight: "none" }}>
                {items.map((d) => (
                  <DeviceRow
                    key={d.deviceId}
                    device={d}
                    busy={busyId === d.deviceId}
                    onCommand={runCommand}
                    editing={editingId === d.deviceId}
                    onToggleEdit={() => setEditingId(editingId === d.deviceId ? null : d.deviceId)}
                    onSaveRoom={(room) => saveRoom(d.deviceId, room)}
                    roomOptions={roomOptions}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && unassigned.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">未割り当て（{unassigned.length}件）</div>
          <div className="mf-hint" style={{ marginTop: 0, opacity: 0.75 }}>
            部屋を割り当てると、上に部屋ごとの枠で表示されるようになります。
          </div>
          <div className="mf-list" style={{ maxHeight: "none" }}>
            {unassigned.map((d) => (
              <DeviceRow
                key={d.deviceId}
                device={d}
                busy={busyId === d.deviceId}
                onCommand={runCommand}
                editing={editingId === d.deviceId}
                onToggleEdit={() => setEditingId(editingId === d.deviceId ? null : d.deviceId)}
                onSaveRoom={(room) => saveRoom(d.deviceId, room)}
                roomOptions={roomOptions}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
