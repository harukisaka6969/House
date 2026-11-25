/**
 * 外出・帰宅に合わせた家電の自動操作の判定（純粋関数のみ・テストから直接読める）。
 *
 * 【外出】誰かが出発して家に誰もいなくなったら、照明は常夜灯（省電力）に、照明以外の電気・家電は
 * オフにする。Dining room は照明だけ常夜灯にし、エアコン等はそのままにする。
 *   ① アリサが家・遥希が出発 → 実行しない     ② 遥希が家・アリサが出発 → 実行しない
 *   ③ 2人で出発 → 2人目の出発で実行           ④⑤ 片方が外にいて、もう片方が出発 → 実行
 * 【帰宅】家に誰もいない状態で誰かが帰ってきたら、Dining room の照明を点ける（家に人がいれば何もしない）。
 *   日の入りの時刻にはSwitchBot側の設定で照明が自動で点くため、日の入り±10分は何もしない。
 *
 * 外出中かどうかは home_presence.left_at（出発で記録、帰宅で消える）で判断する。スマホの電池切れなどで
 * 帰宅の記録が取りこぼされると外出のまま残ってしまうため、古すぎる外出記録は「家にいるかもしれない」と
 * みなし、実行しない側に倒す（人がいるのに家じゅうの電気を消すほうが困るため）。
 */

/** これより前に出発したきり帰宅の記録が無い人は、外出中とはみなさない。 */
export const AWAY_RECORD_MAX_AGE_HOURS = 72;

/** 照明以外はそのままにする部屋（家電画面の部屋名）。 */
export const DINING_ROOM = "Dining room";

/** 赤外線リモコンの照明を常夜灯にするときに押すボタン名（SwitchBotアプリで「night」と表示されているボタン。
 * 名前の違いに備えて、前から順に試す）。 */
export const NIGHT_LIGHT_BUTTONS = ["night", "Night", "常夜灯", "night light", "Night Light"];

export interface PresenceRow {
  profile_slug: string;
  left_at: string | null;
}

/** その人が（新しい記録で）外出中か。記録が無い・古すぎる場合は家にいるかもしれないのでfalse。 */
function isAway(slug: string, presence: PresenceRow[], now: Date, maxAgeHours: number): boolean {
  const leftAt = presence.find((p) => p.profile_slug === slug)?.left_at;
  if (!leftAt) return false;
  const t = new Date(leftAt).getTime();
  return Number.isFinite(t) && t >= now.getTime() - maxAgeHours * 60 * 60 * 1000;
}

/** 自分以外の全員が外出中か。出発時は「これで家に誰もいなくなったか」、帰宅時は「家が空だったか」の判定に使う。 */
export function othersAway(
  self: string,
  people: string[],
  presence: PresenceRow[],
  now: Date,
  maxAgeHours = AWAY_RECORD_MAX_AGE_HOURS
): boolean {
  return people.includes(self) && people.filter((p) => p !== self).every((p) => isAway(p, presence, now, maxAgeHours));
}

export interface DeviceCandidate {
  deviceId: string;
  deviceName: string;
  /** 実機は deviceType、赤外線リモコンは remoteType。 */
  type: string;
  infrared: boolean;
}

export interface DeviceAction {
  device: DeviceCandidate;
  /** 送るコマンド。nightLight は機種に合わせて実行時に具体的なコマンドへ変換する。 */
  action: "turnOff" | "nightLight" | "lightOn";
}

const PHYSICAL_LIGHT = /ceiling light|bulb|strip light|floor lamp|light|lamp/i;
const PHYSICAL_OTHER_OFF = /plug|humidifier|purifier|fan|relay switch|heater/i;
const NOT_CONTROLLABLE = /lock|keypad|hub|sensor|meter|camera|doorbell|curtain|blind|shade|vacuum|cleaner/i;
const INFRARED_LIGHT = /^(diy )?light$/i;
/** 赤外線リモコンのうち、オフの信号が独立していて送っても電源が入る心配が少ないもの。
 * テレビ・プロジェクター等は電源ボタンが入/切の切り替えのことが多く、消えている時に送ると点いてしまうので除く。 */
const INFRARED_OFF = /^(diy )?(air conditioner|fan|air purifier)$/i;

export function isLight(d: DeviceCandidate): boolean {
  const type = d.type.trim();
  if (d.infrared) return INFRARED_LIGHT.test(type);
  return PHYSICAL_LIGHT.test(type) && !NOT_CONTROLLABLE.test(type);
}

function isOtherOff(d: DeviceCandidate): boolean {
  const type = d.type.trim();
  if (d.infrared) return INFRARED_OFF.test(type);
  return PHYSICAL_OTHER_OFF.test(type) && !NOT_CONTROLLABLE.test(type);
}

/** 外出時の操作。照明は常夜灯、照明以外はオフ。Dining room は照明だけ。玄関の鍵（lockDeviceId）は触らない。 */
export function planDeparture(devices: DeviceCandidate[], rooms: Record<string, string>, lockDeviceId?: string | null): DeviceAction[] {
  const actions: DeviceAction[] = [];
  for (const d of devices) {
    if (lockDeviceId && d.deviceId === lockDeviceId) continue;
    if (isLight(d)) actions.push({ device: d, action: "nightLight" });
    else if (rooms[d.deviceId] !== DINING_ROOM && isOtherOff(d)) actions.push({ device: d, action: "turnOff" });
  }
  return actions;
}

/** 帰宅時の操作。Dining room の照明だけを点ける。 */
export function planArrival(devices: DeviceCandidate[], rooms: Record<string, string>): DeviceAction[] {
  return devices.filter((d) => rooms[d.deviceId] === DINING_ROOM && isLight(d)).map((device) => ({ device, action: "lightOn" as const }));
}

/* ---- 日の入り ---- */

/** 家の位置（埼玉県蕨市あたり）。日の入りの計算に使う。 */
export const HOME_LOCATION = { lat: 35.826, lng: 139.68 };
/** 日の入りの前後、帰宅時の点灯を見送る幅（SwitchBot側の自動点灯と重ならないように）。 */
export const SUNSET_BUFFER_MINUTES = 10;

/** その日の日の入り時刻（UTC）。NOAAの簡易式で、誤差は1〜2分程度。dateはJSTの日付（YYYY-MM-DD）。 */
export function sunsetUtc(date: string, lat = HOME_LOCATION.lat, lng = HOME_LOCATION.lng): Date {
  const [y, m, d] = date.split("-").map(Number);
  const rad = Math.PI / 180;
  const dayOfYear = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  const eqTime =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const minutesUtc = 720 - 4 * (lng - ha) - eqTime;
  return new Date(Date.UTC(y, m - 1, d) + minutesUtc * 60000);
}

/** 今が日の入り±バッファの時間帯か（この間はSwitchBot側の自動点灯に任せる）。 */
export function isNearSunset(now: Date, bufferMinutes = SUNSET_BUFFER_MINUTES): boolean {
  const jstDate = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  return Math.abs(now.getTime() - sunsetUtc(jstDate).getTime()) <= bufferMinutes * 60000;
}

/* ---- 安全策 ---- */

/** 人感センサーが今まさに動きを検知していれば、家に人がいるとみなして外出時の操作をやめる
 * （スマホの電池切れなどで帰宅の記録が抜け、家にいるのに外出中のままになっている場合の安全策）。 */
export function motionDetected(statuses: Record<string, unknown>[]): boolean {
  return statuses.some((s) => s.moveDetected === true);
}

/* ---- 玄関の解錠 ---- */

/** 外出していたとみなす最短の時間。これより短い外出（家の前でGPSがぶれた等）では解錠しない。 */
export const UNLOCK_MIN_AWAY_MS = 90 * 1000;

/**
 * 到着時に使う出発時刻を決める。iPhone側に保存した出発時刻（param）とサーバー側の記録（serverLeftAt）のうち、
 * 前回の到着（lastArrivedAt）より後のものだけを有効とし、新しい方を使う。
 * 出発のショートカットが動かなかった日は、iPhoneに前回の出発時刻が残ったままになるため、
 * それを「今回の外出」と取り違えないようにする（出発・到着の記録が抜けても次の回から正しく戻るための安全策）。
 */
export function effectiveLeftAt(param: string | null | undefined, serverLeftAt: string | null, lastArrivedAt: string | null): string | null {
  const arrived = lastArrivedAt ? new Date(lastArrivedAt).getTime() : -Infinity;
  const valid = [param, serverLeftAt]
    .map((v) => (v ? new Date(v).getTime() : NaN))
    .filter((t) => Number.isFinite(t) && t > arrived);
  return valid.length > 0 ? new Date(Math.max(...valid)).toISOString() : null;
}

/**
 * 到着時に玄関を解錠するか。
 * - 出発の記録があり、UNLOCK_MIN_AWAY_MS 以上外出していた → 解錠
 * - 出発の記録が無くても、家に誰かいる → 解錠（家に人がいるので開けても問題が少ない）
 * - 出発の記録が無く、家に誰もいない → 解錠しない（誤作動で無人の家を開けないため）
 */
export function decideUnlock(
  leftAt: string | null,
  someoneElseHome: boolean,
  now: Date,
  minAwayMs = UNLOCK_MIN_AWAY_MS
): { unlock: boolean; reason: string } {
  if (leftAt) {
    const awayMs = now.getTime() - new Date(leftAt).getTime();
    return awayMs >= minAwayMs ? { unlock: true, reason: "away long enough" } : { unlock: false, reason: "away time too short" };
  }
  return someoneElseHome ? { unlock: true, reason: "no leave record, someone home" } : { unlock: false, reason: "no leave record" };
}
