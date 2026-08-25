import "server-only";
import { db } from "./db";
import { getMealLogsInRange, getPfcTarget } from "./mealLog";
import { getRecentLogs, getExercises } from "./gymLog";
import { businessDateJST, addDaysStr } from "./date";
import { extractMetricSeries } from "./pfcRecommendation";
import { getBodyGoal } from "./bodyGoals";
import { generateWeeklyBodyReview } from "./anthropic";
import { DEFAULT_PFC_TARGET } from "./pfcDefaults";
import type { PersonalRecordRow } from "./types";

export interface WeeklyBodyReview {
  score: number;
  components: { nutrition: number | null; training: number | null; bodyComp: number | null };
  good: string[];
  improve: string[];
  /** 何を根拠にこのスコア・フィードバックになったかの事実一覧（画面に表示する透明性のため）。 */
  facts: string[];
}

/** 過去7日間の実際の行動（食事ログのPFC達成度・筋トレの実施頻度・体組成の目標に対する進捗）を
 * 0〜100点で採点し、AIに「良かった点・改善点」を簡潔に言語化させる。
 * 採点はすべてサーバー側の決定的な計算で行い、AIには計算結果の事実だけを渡して言語化のみ任せる
 * （データが無い項目はその項目を採点対象から除外し、他の項目だけで加重平均する）。 */
export async function computeWeeklyBodyReview(ownerId: string): Promise<WeeklyBodyReview> {
  const today = businessDateJST();
  const weekStart = addDaysStr(today, -7);
  const baselineStart = addDaysStr(today, -7 * 9);

  const [target, goal, mealLogs, gymLogs, exercises, recordsRes] = await Promise.all([
    getPfcTarget(ownerId),
    getBodyGoal(ownerId),
    getMealLogsInRange(ownerId, weekStart, addDaysStr(today, 1)),
    getRecentLogs(ownerId, 500),
    getExercises(ownerId),
    db().from("personal_records").select("*").eq("owner", ownerId).order("date", { ascending: true }),
  ]);
  if (recordsRes.error) throw recordsRes.error;
  const records = (recordsRes.data ?? []) as PersonalRecordRow[];
  const pfc = target ?? DEFAULT_PFC_TARGET;

  // --- 栄養スコア: 日ごとにカロリー・タンパク質の目標達成度を採点し、記録があった日の平均を取る ---
  const byDate = new Map<string, { calories: number; protein_g: number }>();
  for (const l of mealLogs) {
    const cur = byDate.get(l.date) ?? { calories: 0, protein_g: 0 };
    cur.calories += l.calories;
    cur.protein_g += l.protein_g;
    byDate.set(l.date, cur);
  }
  const dayScores: number[] = [];
  for (const day of byDate.values()) {
    const calDeviation = pfc.calories > 0 ? Math.abs(day.calories - pfc.calories) / pfc.calories : 0;
    const calScore = Math.max(0, 100 - calDeviation * 200);
    const proteinScore = pfc.protein_g > 0 ? Math.min(100, (day.protein_g / pfc.protein_g) * 100) : 100;
    dayScores.push(calScore * 0.5 + proteinScore * 0.5);
  }
  const daysLogged = byDate.size;
  const nutritionScore = dayScores.length > 0 ? Math.round(dayScores.reduce((a, b) => a + b, 0) / dayScores.length) : null;

  // --- トレーニングスコア: 今週の実施日数を、直近8週(今週を除く)の自分の平均頻度と比べる ---
  const strengthIds = new Set(exercises.filter((e) => e.type === "strength").map((e) => e.id));
  const trainingDatesThisWeek = new Set<string>();
  const trainingDatesBaseline = new Set<string>();
  for (const log of gymLogs) {
    if (!strengthIds.has(log.exercise_id)) continue;
    if (log.date >= weekStart) trainingDatesThisWeek.add(log.date);
    else if (log.date >= baselineStart) trainingDatesBaseline.add(log.date);
  }
  const baselineDaysPerWeek = trainingDatesBaseline.size > 0 ? trainingDatesBaseline.size / 8 : 3;
  const trainingDaysThisWeek = trainingDatesThisWeek.size;
  const trainingScore = Math.round(Math.min(100, (trainingDaysThisWeek / Math.max(1, baselineDaysPerWeek)) * 100));

  // --- 体組成スコア: 目標（体脂肪率・筋肉量の増減ペース）に対して、この1週間で正しい方向に動いたか ---
  const bodyFatSeries = extractMetricSeries(records, "体脂肪率");
  const muscleSeries = extractMetricSeries(records, "筋肉量");
  const bfThisWeek = bodyFatSeries.filter((p) => p.date >= weekStart);
  const muscleThisWeek = muscleSeries.filter((p) => p.date >= weekStart);

  let bodyCompScore: number | null = null;
  const bodyCompNotes: string[] = [];
  if (goal && (goal.body_fat_pct_target !== null || goal.muscle_trend_kg_per_4w !== null)) {
    const subScores: number[] = [];
    if (goal.body_fat_pct_target !== null && bfThisWeek.length > 0) {
      const latestBf = bfThisWeek[bfThisWeek.length - 1].value;
      const prevBf = bodyFatSeries.filter((p) => p.date < weekStart).slice(-1)[0]?.value ?? latestBf;
      const change = latestBf - prevBf;
      const wantDecrease = latestBf > goal.body_fat_pct_target;
      const s = wantDecrease
        ? change <= 0
          ? Math.min(100, 70 + Math.abs(change) * 60)
          : Math.max(0, 70 - change * 60)
        : change <= 0.1
          ? 100
          : Math.max(0, 100 - change * 60);
      subScores.push(s);
      bodyCompNotes.push(`体脂肪率: ${prevBf}%→${latestBf}%（目標${goal.body_fat_pct_target}%）`);
    }
    if (goal.muscle_trend_kg_per_4w !== null && muscleThisWeek.length > 0) {
      const latestM = muscleThisWeek[muscleThisWeek.length - 1].value;
      const prevM = muscleSeries.filter((p) => p.date < weekStart).slice(-1)[0]?.value ?? latestM;
      const changeWeek = latestM - prevM;
      const weeklyTarget = goal.muscle_trend_kg_per_4w / 4;
      const s = changeWeek >= weeklyTarget ? 100 : changeWeek >= 0 ? 60 + (changeWeek / Math.max(0.01, weeklyTarget)) * 40 : 60 + changeWeek * 100;
      subScores.push(Math.max(0, Math.min(100, s)));
      bodyCompNotes.push(
        `筋肉量: ${prevM}kg→${latestM}kg（目標ペース: 4週で${goal.muscle_trend_kg_per_4w >= 0 ? "+" : ""}${goal.muscle_trend_kg_per_4w}kg）`
      );
    }
    if (subScores.length > 0) bodyCompScore = Math.round(subScores.reduce((a, b) => a + b, 0) / subScores.length);
  }

  const weighted: { score: number; weight: number }[] = [];
  if (nutritionScore !== null) weighted.push({ score: nutritionScore, weight: 0.35 });
  weighted.push({ score: trainingScore, weight: 0.3 });
  if (bodyCompScore !== null) weighted.push({ score: bodyCompScore, weight: 0.35 });
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  const score = totalWeight > 0 ? Math.round(weighted.reduce((s, w) => s + w.score * w.weight, 0) / totalWeight) : 0;

  const facts = [
    nutritionScore !== null
      ? `栄養: 直近7日中${daysLogged}日食事を記録、カロリー・タンパク質の目標達成度スコア${nutritionScore}/100`
      : "栄養: この1週間の食事記録がありません",
    `トレーニング: 今週${trainingDaysThisWeek}日実施（直近8週平均${Math.round(baselineDaysPerWeek * 10) / 10}日/週）、達成度スコア${trainingScore}/100`,
    ...(bodyCompNotes.length > 0 ? bodyCompNotes : ["体組成: 目標未設定、またはこの1週間の体組成記録なし"]),
  ];

  let good: string[] = [];
  let improve: string[] = [];
  try {
    const narrative = await generateWeeklyBodyReview(facts.join("\n"));
    good = narrative.good;
    improve = narrative.improve;
  } catch (e) {
    console.error("weekly body review narrative failed", e);
  }

  return { score, components: { nutrition: nutritionScore, training: trainingScore, bodyComp: bodyCompScore }, good, improve, facts };
}
