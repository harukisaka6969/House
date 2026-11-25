import "server-only";
import { listDevices, sendCommand, switchBotAvailable, getDeviceStatus } from "./switchbot";
import { getDeviceRooms } from "./switchbotRooms";
import { getAllPresence } from "./homePresence";
import { getAllProfiles, findProfileBySlug, getLineUserId } from "./profiles";
import { sendLineMessage } from "./lineNotify";
import {
  othersAway,
  planDeparture,
  planArrival,
  isNearSunset,
  motionDetected,
  NIGHT_LIGHT_BUTTONS,
  type DeviceAction,
  type DeviceCandidate,
} from "./awayShutoff";

export type HomeAutomationResult =
  | { ran: false; reason: string }
  | { ran: true; done: string[]; skipped: string[]; failed: { name: string; error: string }[] };

async function loadDevices(): Promise<{ devices: DeviceCandidate[]; rooms: Record<string, string> }> {
  const [{ deviceList, infraredRemoteList }, rooms] = await Promise.all([listDevices(), getDeviceRooms()]);
  return {
    devices: [
      ...deviceList.map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName, type: d.deviceType, infrared: false })),
      ...infraredRemoteList.map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName, type: d.remoteType ?? "", infrared: true })),
    ],
    rooms,
  };
}

/** 判定対象（遥希とアリサ）以外の全員が外出中か。 */
async function othersAwayNow(slug: string): Promise<boolean> {
  const [presence, profiles] = await Promise.all([getAllPresence(), getAllProfiles()]);
  const people = profiles.filter((p) => p.role === "owner").map((p) => p.slug);
  return othersAway(slug, people, presence, new Date());
}

/** 1台分の操作を実際のSwitchBotコマンドにして送る。消えている照明は常夜灯にしない（点けてしまうため）。
 * 戻り値: true=実行、false=何もしなかった。 */
async function perform(a: DeviceAction): Promise<boolean> {
  const { device } = a;
  if (a.action === "turnOff") {
    await sendCommand(device.deviceId, "turnOff");
    return true;
  }
  if (a.action === "lightOn") {
    await sendCommand(device.deviceId, "turnOn");
    // 外出時に常夜灯（明るさ1%）にしているので、実機の照明は明るさも戻す。
    if (!device.infrared) await sendCommand(device.deviceId, "setBrightness", "100").catch(() => {});
    return true;
  }
  // nightLight
  if (!device.infrared) {
    const status = await getDeviceStatus(device.deviceId).catch(() => null);
    if (status && status.power === "off") return false;
    await sendCommand(device.deviceId, "setBrightness", "1");
    return true;
  }
  // 赤外線リモコンの照明は、学習済みの「常夜灯」ボタンを押す。ボタンが無ければ消灯する。
  for (const button of NIGHT_LIGHT_BUTTONS) {
    try {
      await sendCommand(device.deviceId, button, "default", "customize");
      return true;
    } catch {
      // 次の名前を試す
    }
  }
  await sendCommand(device.deviceId, "turnOff");
  return true;
}

async function performAll(actions: DeviceAction[]): Promise<HomeAutomationResult> {
  // 1台の失敗で残りを止めないよう、1台ずつ送って結果を集める。
  const done: string[] = [];
  const skipped: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const a of actions) {
    try {
      if (await perform(a)) done.push(`${a.device.deviceName}:${a.action}`);
      else skipped.push(a.device.deviceName);
    } catch (e) {
      failed.push({ name: a.device.deviceName, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (failed.length > 0) console.error("home automation: some devices failed", failed);
  return { ran: true, done, skipped, failed };
}

/** 出発のたびに呼ぶ。この出発で家に誰もいなくなったときだけ、照明を常夜灯に、照明以外をオフにする
 * （Dining room は照明だけ）。人感センサーが動きを検知していれば、家に人がいるとみなしてやめる。 */
export async function runDepartureAutomation(slug: string): Promise<HomeAutomationResult> {
  if (!switchBotAvailable()) return { ran: false, reason: "switchbot not configured" };
  if (!(await othersAwayNow(slug))) return { ran: false, reason: "someone may be home" };

  const { devices, rooms } = await loadDevices();
  const sensors = devices.filter((d) => !d.infrared && /motion sensor/i.test(d.type));
  const statuses = await Promise.all(sensors.map((s) => getDeviceStatus(s.deviceId).catch(() => ({}))));
  if (motionDetected(statuses)) return { ran: false, reason: "motion detected at home" };

  return performAll(planDeparture(devices, rooms, process.env.SWITCHBOT_HOME_LOCK_DEVICE_ID));
}

/** 帰宅のたびに呼ぶ。家に誰もいない状態で帰ってきたときだけ、Dining room の照明を点ける。
 * 日の入り±10分はSwitchBot側の自動点灯に任せて何もしない。 */
export async function runArrivalAutomation(slug: string): Promise<HomeAutomationResult> {
  if (!switchBotAvailable()) return { ran: false, reason: "switchbot not configured" };
  if (isNearSunset(new Date())) return { ran: false, reason: "near sunset" };
  if (!(await othersAwayNow(slug))) return { ran: false, reason: "someone is home" };

  const { devices, rooms } = await loadDevices();
  return performAll(planArrival(devices, rooms));
}

/** 出発・帰宅したその人だけに送るLINE（「いってらっしゃい」「おかえり」と、家電をどうしたか）。 */
export function presenceMessage(kind: "leave" | "arrive", result: HomeAutomationResult): string {
  if (kind === "leave") {
    if (result.ran) {
      const failed = result.failed.length > 0 ? `\n（${result.failed.map((f) => f.name).join("、")}は操作できませんでした）` : "";
      return `🚪 いってらっしゃい。家に誰もいなくなったので、照明を常夜灯に、照明以外の家電をオフにしました（ダイニングのエアコンはそのまま）。${failed}`;
    }
    return result.reason === "motion detected at home"
      ? "🚪 いってらっしゃい。家の人感センサーが動きを検知しているので、家電はそのままにしました。"
      : "🚪 いってらっしゃい。";
  }
  if (result.ran && result.done.length > 0) {
    const failed = result.failed.length > 0 ? `\n（${result.failed.map((f) => f.name).join("、")}は操作できませんでした）` : "";
    return `🏠 おかえり。ダイニングの照明を点けました。${failed}`;
  }
  return "🏠 おかえり。";
}

/** 出発・帰宅したその人だけにLINEで知らせる（世帯全員には送らない）。送れなくても処理は止めない。 */
export async function notifyPresence(slug: string, kind: "leave" | "arrive", result: HomeAutomationResult): Promise<void> {
  try {
    const profile = await findProfileBySlug(slug);
    const lineUserId = profile ? await getLineUserId(profile.id) : null;
    if (lineUserId) await sendLineMessage(lineUserId, presenceMessage(kind, result));
  } catch (e) {
    console.error("presence LINE notify failed", e);
  }
}
