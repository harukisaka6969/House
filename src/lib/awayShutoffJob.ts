import "server-only";
import { listDevices, sendCommand, switchBotAvailable } from "./switchbot";
import { getDeviceRooms } from "./switchbotRooms";
import { getAllPresence } from "./homePresence";
import { getAllProfiles } from "./profiles";
import { everyoneAway, selectShutoffTargets } from "./awayShutoff";

export type AwayShutoffResult =
  | { ran: false; reason: string }
  | { ran: true; turnedOff: string[]; failed: { name: string; error: string }[] };

/** 出発のたびに呼ぶ。家に誰もいなくなったときだけ、Dining room 以外の電気・家電をオフにする。 */
export async function runAwayShutoffIfEveryoneLeft(): Promise<AwayShutoffResult> {
  if (!switchBotAvailable()) return { ran: false, reason: "switchbot not configured" };

  const [presence, profiles] = await Promise.all([getAllPresence(), getAllProfiles()]);
  const people = profiles.filter((p) => p.role === "owner").map((p) => p.slug);
  if (!everyoneAway(people, presence, new Date())) return { ran: false, reason: "someone may be home" };

  const [{ deviceList, infraredRemoteList }, rooms] = await Promise.all([listDevices(), getDeviceRooms()]);
  const targets = selectShutoffTargets(
    [
      ...deviceList.map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName, type: d.deviceType, infrared: false })),
      ...infraredRemoteList.map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName, type: d.remoteType ?? "", infrared: true })),
    ],
    rooms,
    process.env.SWITCHBOT_HOME_LOCK_DEVICE_ID
  );

  // 1台の失敗で残りを止めないよう、1台ずつ送って結果を集める。
  const turnedOff: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const d of targets) {
    try {
      await sendCommand(d.deviceId, "turnOff");
      turnedOff.push(d.deviceName);
    } catch (e) {
      failed.push({ name: d.deviceName, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (failed.length > 0) console.error("away shutoff: some devices failed", failed);
  return { ran: true, turnedOff, failed };
}
