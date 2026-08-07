import "server-only";
import { db } from "./db";

/** deviceId → 部屋名。まだマイグレーション未適用でも他機能を壊さないよう失敗時は空マップ。 */
export async function getDeviceRooms(): Promise<Record<string, string>> {
  try {
    const { data, error } = await db().from("switchbot_device_rooms").select("device_id, room");
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.device_id as string, r.room as string]));
  } catch (e) {
    console.error("getDeviceRooms failed", e);
    return {};
  }
}

/** デバイスを部屋に割り当てる。roomが空/nullなら割り当て解除。 */
export async function setDeviceRoom(deviceId: string, room: string | null): Promise<void> {
  const trimmed = room?.trim();
  if (!trimmed) {
    const { error } = await db().from("switchbot_device_rooms").delete().eq("device_id", deviceId);
    if (error) throw error;
    return;
  }
  const { error } = await db().from("switchbot_device_rooms").upsert({ device_id: deviceId, room: trimmed }, { onConflict: "device_id" });
  if (error) throw error;
}
