import "server-only";
import { db } from "./db";
import { getMealLogsInRange, upsertPfcTarget } from "./mealLog";
import { getRecentLogs, getExercises } from "./gymLog";
import { getBodyGoal } from "./bodyGoals";
import { businessDateJST, addDaysStr } from "./date";
import type { PersonalRecordRow } from "./types";

const KCAL_PER_KG_FAT = 7700;
const TREND_WINDOW_DAYS = 28;
const MIN_RELIABLE_SPAN_DAYS = 7;
/** 増量狙いでの過体重(1週間で1kg超)などデータ異常を弾く上限。 */
const MAX_PLAUSIBLE_WEIGHT_CHANGE_KG = 8;
const MIN_PLAUSIBLE_DAILY_KCAL = 800;
const MAX_PLAUSIBLE_DAILY_KCAL = 6000;
/** 食事ログは記録漏れが起きやすい（食べたのに記録し忘れる）ため、体組成ベースの概算(fallbackTdee)と
 * 大きく食い違う実測値は「記録漏れで少なく出ている」とみなして採用しない。 */
const PLAUSIBLE_TDEE_RATIO = [0.65, 1.5] as const;
const MIN_PLAUSIBLE_TDEE = 1300;

export function leadingNumber(value: string): number | null {
  const m = value.match(/^-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** 指定ラベルの数値系列を、記録全体（カテゴリ問わず）から日付昇順で拾う。同日複数件は最後のものを使う。 */
export function extractMetricSeries(records: PersonalRecordRow[], label: string): { date: string; value: number }[] {
  const byDate = new Map<string, number>();
  for (const r of [...records].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))) {
    const m = r.metrics.find((mm) => mm.label === label);
    if (!m) continue;
    const n = leadingNumber(m.value);
    if (n !== null) byDate.set(r.date, n);
  }
  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

/** 直近28日以内に2点以上あればその範囲、無ければ全期間から拾う（それでも2点無ければトレンド算出不能）。 */
function pickTrendWindow(series: { date: string; value: number }[], today: string): { start: { date: string; value: number }; end: { date: string; value: number } } | null {
  if (series.length < 2) return null;
  const windowStart = addDaysStr(today, -TREND_WINDOW_DAYS);
  const withinWindow = series.filter((p) => p.date >= windowStart);
  const candidates = withinWindow.length >= 2 ? withinWindow : series;
  if (candidates.length < 2) return null;
  return { start: candidates[0], end: candidates[candidates.length - 1] };
}

/** 直近1週間 vs その前の週の、strength種目の総挙上量（重量×回数の合計）の変化率(%)。判定できなければnull。 */
async function computeVolumeTrendPct(ownerId: string): Promise<number | null> {
  const [logs, exercises] = await Promise.all([getRecentLogs(ownerId, 500), getExercises(ownerId)]);
  const strengthIds = new Set(exercises.filter((e) => e.type === "strength").map((e) => e.id));
  const today = businessDateJST();
  const weekStart = addDaysStr(today, -7);
  const prevWeekStart = addDaysStr(today, -14);
  let thisWeek = 0;
  let lastWeek = 0;
  for (const log of logs) {
    if (!strengthIds.has(log.exercise_id)) continue;
    const vol = log.sets.reduce((s, st) => (Number.isFinite(st.weight) && Number.isFinite(st.reps) ? s + st.weight * st.reps : s), 0);
    if (log.date >= weekStart) thisWeek += vol;
    else if (log.date >= prevWeekStart) lastWeek += vol;
  }
  if (lastWeek <= 0) return null;
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10;
}

export interface PfcRecommendation {
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  /** 何をどう根拠にこの数値にしたかの説明文（返信メッセージにそのまま使う）。 */
  message: string;
}

/** 体組成の記録（体重・体脂肪率・筋肉量・除脂肪量）、実際の食事ログ、筋トレの挙上量トレンドを
 * 突き合わせて、減量しつつ筋肉量を落とさない（できれば増やす）ための食事目標を算出し、保存する。
 *
 * 考え方:
 * 1. 直近の体重変化と、その同じ期間の実際の平均摂取カロリーから、AIに頼らず実測ベースの
 *    消費カロリー（TDEE）を逆算する（エネルギー収支: 体重変化kg×7700kcal/kg）。
 *    データが足りない場合や、食事ログの記録漏れで実測値が体組成データと大きく食い違う場合は、
 *    体組成計の基礎代謝量（無ければ除脂肪量からのKatch-McArdle式）＋活動係数で概算する。
 * 2. 「体の目標」（body_goals: 目標体脂肪率・筋肉量の目標ペース）が設定されている場合はそれを直接使う。
 *    体脂肪率が目標に到達済みなら絞るのをやめ、メンテナンス〜（筋肉量の目標がプラスなら）軽い増量に切り替える。
 *    未達なら赤字幅は基本15%。筋トレの総挙上量が伸びていれば控えめに、筋肉量の実際の変化が目標ペースに
 *    届いていなければさらに絞る（10%を上限）ことで、筋肉を守りながら体脂肪を減らす方向に倒す。
 *    目標が未設定の場合は、筋肉量の増減±0.2kgを簡易的な目安として同様の判断をする。
 * 3. タンパク質は除脂肪量(無ければ体重)×2.4g/kg（減量期の筋量維持で推奨される範囲の上限寄り）、
 *    脂質はホルモン面の下限として体重×0.8g/kgを確保し、残りを炭水化物に割り当てる。
 *
 * 体重の記録が一度もなければ算出できないためnullを返す。 */
export async function recomputePfcTargetFromBodyRecords(ownerId: string): Promise<PfcRecommendation | null> {
  const [{ data, error }, goal] = await Promise.all([
    db().from("personal_records").select("*").eq("owner", ownerId).order("date", { ascending: true }),
    getBodyGoal(ownerId),
  ]);
  if (error) throw error;
  const records = (data ?? []) as PersonalRecordRow[];

  const weightSeries = extractMetricSeries(records, "体重");
  if (weightSeries.length === 0) return null;

  const latestWeight = weightSeries[weightSeries.length - 1].value;
  const bodyFatSeries = extractMetricSeries(records, "体脂肪率");
  const muscleSeries = extractMetricSeries(records, "筋肉量");
  const lbmSeries = extractMetricSeries(records, "除脂肪量");
  const bmrSeries = extractMetricSeries(records, "基礎代謝量");
  const latestBodyFat = bodyFatSeries[bodyFatSeries.length - 1]?.value ?? null;
  const latestLbm = lbmSeries[lbmSeries.length - 1]?.value ?? (latestBodyFat !== null ? latestWeight * (1 - latestBodyFat / 100) : null);
  const latestBmr = bmrSeries[bmrSeries.length - 1]?.value ?? null;

  const today = businessDateJST();
  const window = pickTrendWindow(weightSeries, today);

  let weightChangeKg: number | null = null;
  let daysSpan = 0;
  let avgDailyIntake: number | null = null;
  let estimatedTdee: number | null = null;

  if (window) {
    daysSpan = daysBetween(window.start.date, window.end.date);
    const change = window.end.value - window.start.value;
    if (daysSpan >= MIN_RELIABLE_SPAN_DAYS && Math.abs(change) <= MAX_PLAUSIBLE_WEIGHT_CHANGE_KG) {
      weightChangeKg = change;
      const mealLogs = await getMealLogsInRange(ownerId, window.start.date, addDaysStr(window.end.date, 1));
      const totalCalories = mealLogs.reduce((s, l) => s + l.calories, 0);
      const daysWithData = new Set(mealLogs.map((l) => l.date)).size;
      const avg = daysWithData > 0 ? totalCalories / daysWithData : null;
      if (avg !== null && avg >= MIN_PLAUSIBLE_DAILY_KCAL && avg <= MAX_PLAUSIBLE_DAILY_KCAL) {
        avgDailyIntake = avg;
        estimatedTdee = avg - (change * KCAL_PER_KG_FAT) / daysSpan;
      }
    }
  }

  // 体組成計の基礎代謝量（測定値）があればそれを優先し、無ければKatch-McArdle式（除脂肪量ベース。
  // 年齢不要で運動習慣者に向く）で概算する。いずれも活動係数1.55（週数回の筋トレを想定した中程度の活動量）
  // をかけてTDEEの概算値とする。
  const assumedLbm = latestLbm ?? latestWeight * 0.8;
  const fallbackBmr = latestBmr ?? 370 + 21.6 * assumedLbm;
  const fallbackTdee = fallbackBmr * 1.55;

  // 食事ログは記録漏れが起きやすく、実測ベースの推定値が体組成ベースの概算と大きく食い違う場合は
  // 「記録が実際の摂取量より少なく出ている」とみなし、信頼できる概算側を採用する。
  let usedFallbackDueToLogGap = false;
  if (estimatedTdee !== null) {
    const ratio = estimatedTdee / fallbackTdee;
    if (estimatedTdee < MIN_PLAUSIBLE_TDEE || ratio < PLAUSIBLE_TDEE_RATIO[0] || ratio > PLAUSIBLE_TDEE_RATIO[1]) {
      usedFallbackDueToLogGap = true;
      estimatedTdee = null;
    }
  }
  const tdee = estimatedTdee ?? fallbackTdee;

  const volumeTrendPct = await computeVolumeTrendPct(ownerId);

  const muscleWindowStart = addDaysStr(today, -TREND_WINDOW_DAYS);
  const muscleWithinWindow = muscleSeries.filter((p) => p.date >= muscleWindowStart);
  const muscleBaseline = muscleWithinWindow[0] ?? muscleSeries[0];
  const muscleChangeKg = muscleSeries.length >= 2 && muscleBaseline ? muscleSeries[muscleSeries.length - 1].value - muscleBaseline.value : null;

  // 「体の目標」（体脂肪率・筋肉量の目標ペース）が設定されていれば、それを直接の判断材料にする。
  // 体脂肪率が既に目標に達している場合は、それ以上絞らずメンテナンス〜微増量（筋肉量の目標が
  // プラスなら軽いサープラス）に切り替える。
  const atBodyFatGoal = goal?.body_fat_pct_target !== null && goal?.body_fat_pct_target !== undefined && latestBodyFat !== null && latestBodyFat <= goal.body_fat_pct_target + 0.5;
  const muscleTargetPer4w = goal?.muscle_trend_kg_per_4w ?? null;

  let deficitPct: number;
  if (atBodyFatGoal) {
    deficitPct = muscleTargetPer4w !== null && muscleTargetPer4w > 0 ? -0.05 : 0;
  } else {
    deficitPct = 0.15;
    if (volumeTrendPct !== null && volumeTrendPct > 0) deficitPct -= 0.03;
    if (volumeTrendPct !== null && volumeTrendPct < -10) deficitPct += 0.03;
    const muscleShortfall = muscleTargetPer4w !== null ? muscleChangeKg !== null && muscleChangeKg < muscleTargetPer4w : muscleChangeKg !== null && muscleChangeKg < -0.2;
    if (muscleShortfall) deficitPct = Math.min(deficitPct, 0.1);
    deficitPct = Math.max(0.08, Math.min(0.2, deficitPct));
  }

  let calories = Math.max(1600, Math.round(tdee * (1 - deficitPct)));

  const proteinBasisKg = latestLbm ?? latestWeight;
  const protein_g = Math.round(proteinBasisKg * 2.4);
  const fat_g = Math.round(Math.max(latestWeight * 0.8, (calories * 0.2) / 9));
  let carb_g = Math.round((calories - protein_g * 4 - fat_g * 9) / 4);
  if (carb_g < 50) {
    carb_g = 50;
    calories = protein_g * 4 + fat_g * 9 + carb_g * 4;
  }

  const parts: string[] = [];
  if (weightChangeKg !== null && estimatedTdee !== null) {
    const dir = weightChangeKg < 0 ? "減少" : weightChangeKg > 0 ? "増加" : "横ばい";
    parts.push(
      `直近${daysSpan}日間で体重が${Math.abs(Math.round(weightChangeKg * 10) / 10)}kg${dir}、その間の平均摂取カロリー${Math.round(avgDailyIntake ?? 0).toLocaleString()}kcalから、実測ベースの消費カロリーを${Math.round(tdee).toLocaleString()}kcalと推定しました。`
    );
  } else if (usedFallbackDueToLogGap) {
    parts.push(
      `食事の記録から計算した摂取カロリーが体重の変化と比べて不自然だったため（記録漏れの可能性）、体組成計の測定値${latestBmr ? "（基礎代謝量）" : "・除脂肪量"}から消費カロリーを約${Math.round(tdee).toLocaleString()}kcalと概算しました。`
    );
  } else {
    parts.push(
      `体重の記録がまだ十分でないため、${latestBmr ? "体組成計の基礎代謝量" : "除脂肪量"}から概算した消費カロリー（約${Math.round(tdee).toLocaleString()}kcal）をもとに算出しています。記録が増えるほど精度が上がります。`
    );
  }
  if (atBodyFatGoal) {
    parts.push(
      `体脂肪率${latestBodyFat}%が目標${goal?.body_fat_pct_target}%に到達しているため、絞るのをやめて${deficitPct < 0 ? "軽い増量" : "メンテナンス"}に切り替えました。`
    );
  } else if (volumeTrendPct !== null) {
    const trendNote = volumeTrendPct > 0 ? "伸びているため赤字を控えめに" : volumeTrendPct < -10 ? "落ちているため赤字をやや広めに" : "横ばいのため標準の赤字幅で";
    parts.push(`筋トレの総挙上量は先週比${volumeTrendPct > 0 ? "+" : ""}${volumeTrendPct}%で、${trendNote}設定しています。`);
  }
  if (!atBodyFatGoal && muscleChangeKg !== null) {
    if (muscleTargetPer4w !== null && muscleChangeKg < muscleTargetPer4w) {
      parts.push(
        `⚠️ この期間の筋肉量の変化は${muscleChangeKg >= 0 ? "+" : ""}${Math.round(muscleChangeKg * 10) / 10}kgで、目標ペース（4週で${muscleTargetPer4w >= 0 ? "+" : ""}${muscleTargetPer4w}kg）に届いていないため、赤字幅を抑えタンパク質を優先しました。`
      );
    } else if (muscleTargetPer4w === null && muscleChangeKg < -0.2) {
      parts.push(`⚠️ この期間で筋肉量が${Math.abs(Math.round(muscleChangeKg * 10) / 10)}kg減っているため、赤字幅を抑えタンパク質を優先しました。`);
    }
  }
  parts.push(`🎯 新しい目標: ${calories.toLocaleString()}kcal（P${protein_g}g / F${fat_g}g / C${carb_g}g）`);

  await upsertPfcTarget(ownerId, { calories, protein_g, fat_g, carb_g });

  return { calories, protein_g, fat_g, carb_g, message: parts.join("\n") };
}
