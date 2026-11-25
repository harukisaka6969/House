/**
 * 外出時の「家じゅうの電気を消す」ジョブの判定（純粋関数のみ・テストから直接読める）。
 *
 * 誰かが出発したとき、その時点で家に誰もいなくなるなら実行する。
 *   ① アリサが家・遥希が出発 → 実行しない     ② 遥希が家・アリサが出発 → 実行しない
 *   ③ 2人で出発 → 2人目の出発で実行           ④⑤ 片方が外にいて、もう片方が出発 → 実行
 * 外出中かどうかは home_presence.left_at（出発で記録、帰宅で消える）で判断する。帰宅の記録が
 * 取りこぼされると外出のまま残ってしまうため、古すぎる外出記録は「家にいるかもしれない」とみなし、
 * 実行しない側に倒す（人がいるのに家じゅうの電気を消すほうが困るため）。
 */

/** これより前に出発したきり帰宅の記録が無い人は、外出中とはみなさない。 */
export const AWAY_RECORD_MAX_AGE_HOURS = 72;

/** 消さない部屋（家電画面の部屋名）。 */
export const KEEP_ON_ROOMS = ["Dining room"];

export interface PresenceRow {
  profile_slug: string;
  left_at: string | null;
}

/** 家に誰もいなくなったか。people は判定対象（遥希とアリサ）のslug。 */
export function everyoneAway(people: string[], presence: PresenceRow[], now: Date, maxAgeHours = AWAY_RECORD_MAX_AGE_HOURS): boolean {
  const oldest = now.getTime() - maxAgeHours * 60 * 60 * 1000;
  return (
    people.length > 0 &&
    people.every((slug) => {
      const leftAt = presence.find((p) => p.profile_slug === slug)?.left_at;
      if (!leftAt) return false;
      const t = new Date(leftAt).getTime();
      return Number.isFinite(t) && t >= oldest;
    })
  );
}

export interface ShutoffCandidate {
  deviceId: string;
  deviceName: string;
  /** 実機は deviceType、赤外線リモコンは remoteType。 */
  type: string;
  infrared: boolean;
}

/** 状態を持って確実に「オフ」にできる実機（スマートプラグ・電球・照明・空調家電など）。 */
const PHYSICAL_OFF = /plug|bulb|strip light|ceiling light|floor lamp|light|lamp|humidifier|purifier|fan|relay switch|heater/i;
/** 赤外線リモコンのうち、オフの信号が独立していて送っても電源が入る心配が少ないもの。
 * テレビ・プロジェクター等は電源ボタンが入/切の切り替えのことが多く、消えている時に送ると点いてしまうので除く。 */
const INFRARED_OFF = /^(diy )?(air conditioner|light|fan|air purifier)$/i;

/** 電気を消す対象。Dining room と、玄関の鍵（lockDeviceId）は除く。部屋が未設定の機器は対象に含める。 */
export function selectShutoffTargets(
  devices: ShutoffCandidate[],
  rooms: Record<string, string>,
  lockDeviceId?: string | null
): ShutoffCandidate[] {
  return devices.filter((d) => {
    if (lockDeviceId && d.deviceId === lockDeviceId) return false;
    if (KEEP_ON_ROOMS.includes(rooms[d.deviceId] ?? "")) return false;
    return d.infrared ? INFRARED_OFF.test(d.type.trim()) : PHYSICAL_OFF.test(d.type) && !/lock|keypad|hub|sensor/i.test(d.type);
  });
}
