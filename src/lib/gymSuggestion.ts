import type { GymSetEntry } from "./apiTypes";

const TARGET_REPS = 10;

/** 直近の記録（新しい順）から、次回の目安をひとこと生成する。単純な漸進的過負荷の目安であり厳密なものではない。 */
export function suggestNext(logsDesc: { date: string; sets: GymSetEntry[] }[]): string {
  const withSets = logsDesc.filter((l) => l.sets.length > 0);
  if (withSets.length === 0) return "まだ記録がありません。無理のない重量から始めて、セットごとの回数を記録しましょう。";

  const last = withSets[0];
  const lastSummary = last.sets.map((s) => s.reps).join("/");
  const lastWeight = last.sets[0]?.weight ?? 0;
  const weightLabel = lastWeight > 0 ? `${lastWeight}kg` : "自重";

  const allHitTarget = last.sets.every((s) => s.reps >= TARGET_REPS);
  if (allHitTarget) {
    return `前回 ${weightLabel} × ${lastSummary}。全セットで${TARGET_REPS}回以上こなせています。重量を少し上げてみましょう（目安 +2.5〜5kg）。`;
  }

  const prev = withSets[1];
  if (prev && prev.sets[0]?.weight === lastWeight) {
    const prevTop = prev.sets[0]?.reps ?? 0;
    const lastTop = last.sets[0]?.reps ?? 0;
    if (lastTop > prevTop) {
      return `前回 ${weightLabel} × ${lastSummary}。回数が伸びてきています。同じ重量でもう少し回数を狙いましょう。`;
    }
  }

  return `前回 ${weightLabel} × ${lastSummary}。同じ重量で回数の維持〜微増を狙いましょう。`;
}
