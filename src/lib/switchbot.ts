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

export interface SwitchBotScene {
  sceneId: string;
  sceneName: string;
}

/** SwitchBotアプリ側で作成済みのシーン（条件付き自動化）一覧。API経由でのシーン新規作成・条件編集はできず、
 * 既存シーンの一覧取得と手動実行のみ可能（条件の作成・変更はSwitchBotアプリで行う必要がある）。 */
export async function listScenes(): Promise<SwitchBotScene[]> {
  return call<SwitchBotScene[]>("/scenes");
}

/** 既存シーンを手動で実行する。 */
export async function executeScene(sceneId: string): Promise<void> {
  await call<Record<string, unknown>>(`/scenes/${sceneId}/execute`, { method: "POST" });
}
