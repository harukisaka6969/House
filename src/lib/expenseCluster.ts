/** 年間タイムライン用: 支出を「大項目（トリップ・イベント単位）」と「小項目（個々の支出）」に自動で振り分ける。
 * DB/AI依存なしでテストできるよう yearTimeline.ts から分離。 */

export interface ClusterableExpense {
  id: string;
  date: string; // "YYYY-MM-DD"
  category: string;
  memo: string;
  amount: number;
}

const CLUSTER_GAP_DAYS = 5;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** 日付昇順で渡すこと。同じカテゴリで、直前（そのカテゴリ内で）の項目からCLUSTER_GAP_DAYS以内の支出を
 * 同じ塊にまとめる。カテゴリごとに独立して連鎖を追うため、間に別カテゴリの支出が挟まっていても
 * チェーンが途切れない（例: 旅行の合間に別カテゴリの支出が1件入っていても旅行同士はまとまる）。 */
export function clusterExpenses<T extends ClusterableExpense>(sortedByDate: T[]): T[][] {
  const byCategory = new Map<string, T[]>();
  for (const e of sortedByDate) {
    const list = byCategory.get(e.category);
    if (list) list.push(e);
    else byCategory.set(e.category, [e]);
  }

  const clusters: T[][] = [];
  for (const list of byCategory.values()) {
    let current: T[] = [];
    for (const e of list) {
      const prev = current[current.length - 1];
      if (prev && daysBetween(prev.date, e.date) <= CLUSTER_GAP_DAYS) {
        current.push(e);
      } else {
        if (current.length) clusters.push(current);
        current = [e];
      }
    }
    if (current.length) clusters.push(current);
  }
  clusters.sort((a, b) => a[0].date.localeCompare(b[0].date));
  return clusters;
}

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** AIでの命名前に使う暫定タイトル。単発ならメモそのもの、複数件ならカテゴリ＋期間。 */
export function fallbackClusterTitle<T extends ClusterableExpense>(cluster: T[]): string {
  if (cluster.length === 1) return cluster[0].memo || cluster[0].category;
  const from = cluster[0].date;
  const to = cluster[cluster.length - 1].date;
  return from === to ? `${cluster[0].category}（${shortDate(from)}）` : `${cluster[0].category}（${shortDate(from)}〜${shortDate(to)}）`;
}
