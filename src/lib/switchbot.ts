import "server-only";
import crypto from "crypto";

const BASE_URL = "https://api.switch-bot.com/v1.1";

export function switchBotAvailable(): boolean {
  return !!process.env.SWITCHBOT_TOKEN && !!process.env.SWITCHBOT_SECRET;
}

function authHeaders(): Record<string, string> {
  const token = process.env.SWITCHBOT_TOKEN;
  const secret = process.env.SWITCHBOT_SECRET;
  if (!token || !secret) throw new Error("SWITCHBOT_TOKEN / SWITCHBOT_SECRET is not configured");
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const sign = crypto
    .createHmac("sha256", secret)
    .update(token + t + nonce)
    .digest("base64");
  return {
    Authorization: token,
    sign,
    t,
    nonce,
    "Content-Type": "application/json; charset=utf8",
  };
}

interface SwitchBotApiResponse<T> {
  statusCode: number;
  message: string;
  body: T;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  const json = (await res.json()) as SwitchBotApiResponse<T>;
  if (json.statusCode !== 100) throw new Error(json.message || `SwitchBot API error (status ${json.statusCode})`);
  return json.body;
}

export interface SwitchBotDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  hubDeviceId?: string;
  remoteType?: string;
}

/** 実機デバイス＋赤外線リモコン（エアコン等、Hub経由の学習リモコン）の一覧。 */
export async function listDevices(): Promise<{ deviceList: SwitchBotDevice[]; infraredRemoteList: SwitchBotDevice[] }> {
  return call<{ deviceList: SwitchBotDevice[]; infraredRemoteList: SwitchBotDevice[] }>("/devices");
}

/** デバイスの現在状態（電源ON/OFF・温度など、機種によって内容が異なる）。センサー系以外は無くても404ではなくエラー文言が返る場合がある。 */
export async function getDeviceStatus(deviceId: string): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>(`/devices/${deviceId}/status`);
}

/** デバイス（または赤外線リモコン）へコマンドを送る。 */
export async function sendCommand(deviceId: string, command: string, parameter: string = "default", commandType: string = "command"): Promise<void> {
  await call<Record<string, unknown>>(`/devices/${deviceId}/commands`, {
    method: "POST",
    body: JSON.stringify({ command, parameter, commandType }),
  });
}
