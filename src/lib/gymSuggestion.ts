import type { GymSetEntry } from "./apiTypes";

const TARGET_REPS = 10;

export function formatWeight(w: number): string {
  return w > 0 ? `${w}kg` : "自重";
}

/** セットの重量・回数の表示。全セット同じ重量なら「50kg × 9/8/9」、ドロップセット等で
 * セットごとに重量が違う場合は「50kg×9 / 50kg×8 / 35kg×9」のようにセットごとに表示する。 */
export function formatSets(sets: GymSetEntry[]): string {
  if (sets.length === 0) return "";
  const uniformWeight = sets.every((s) => s.weight === sets[0].weight);
  if (uniformWeight) {
    return `${formatWeight(sets[0].weight)} × ${sets.map((s) => s.reps).join("/")}`;
  }
  return sets.map((s) => `${formatWeight(s.weight)}×${s.reps}`).join(" / ");
}

/** 直近の記録（新しい順）から、次回の目安をひとこと生成する。単純な漸進的過負荷の目安であり厳密なものではない。 */
export function suggestNext(logsDesc: { date: string; sets: GymSetEntry[] }[]): string {
  const withSets = logsDesc.filter((l) => l.sets.length > 0);
  if (withSets.length === 0) return "まだ記録がありません。無理のない重量から始めて、セットごとの回数を記録しましょう。";

  const last = withSets[0];
  const lastSummary = formatSets(last.sets);
  const lastWeight = last.sets[0]?.weight ?? 0;

  const allHitTarget = last.sets.every((s) => s.reps >= TARGET_REPS);
  if (allHitTarget) {
    return `前回 ${lastSummary}。全セットで${TARGET_REPS}回以上こなせています。重量を少し上げてみましょう（目安 +2.5〜5kg）。`;
  }

  const prev = withSets[1];
  if (prev && prev.sets[0]?.weight === lastWeight) {
    const prevTop = prev.sets[0]?.reps ?? 0;
    const lastTop = last.sets[0]?.reps ?? 0;
    if (lastTop > prevTop) {
      return `前回 ${lastSummary}。回数が伸びてきています。同じ重量でもう少し回数を狙いましょう。`;
    }
  }

  return `前回 ${lastSummary}。同じ重量で回数の維持〜微増を狙いましょう。`;
}

/** 有酸素種目の次回の目安。時間・距離の伸びから単純に判断する。 */
export function suggestCardioNext(
  logsDesc: { date: string; duration_minutes: number | null; distance_km: number | null }[]
): string {
  const withData = logsDesc.filter((l) => l.duration_minutes || l.distance_km);
  if (withData.length === 0) return "まだ記録がありません。無理のない時間・距離から始めましょう。";

  const last = withData[0];
  const lastLabel = [last.duration_minutes ? `${last.duration_minutes}分` : null, last.distance_km ? `${last.distance_km}km` : null]
    .filter(Boolean)
    .join(" ／ ");

  const prev = withData[1];
  if (prev && last.distance_km && prev.distance_km && last.duration_minutes && prev.duration_minutes) {
    const lastPace = last.duration_minutes / last.distance_km;
    const prevPace = prev.duration_minutes / prev.distance_km;
    if (lastPace < prevPace) {
      return `前回 ${lastLabel}。ペースが上がっています。同じ距離でこのペースを維持してみましょう。`;
    }
  }
  return `前回 ${lastLabel}。時間か距離を少しずつ伸ばしてみましょう。`;
}
