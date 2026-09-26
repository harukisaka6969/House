/**
 * AIの応答からJSONを取り出す部分だけを切り出したモジュール（純粋関数のみ・server-onlyではないので
 * テストから直接読み込める）。web_searchを有効にしたリクエストでは、JSONの前後に「まず検索します」
 * のような説明文が混ざることがあり、応答全体をそのままJSON.parseすると失敗するため、ここで吸収する。
 */

export interface MealEstimate {
  description: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

function stripFence(text: string): string {
  return text.replace(/```json|```/g, "").trim();
}

interface JsonCandidate {
  value: unknown;
  start: number;
  end: number;
}

/** 応答テキストに含まれるJSONオブジェクトを、出現位置つきで全部取り出す。文字列リテラル内の
 * 波括弧は無視して対応を取る。外側のオブジェクトが途中で切れていても内側の完成している
 * オブジェクトは拾えるように、入れ子も含めて総当たりで試す。 */
function scanJsonCandidates(text: string): JsonCandidate[] {
  const found: JsonCandidate[] = [];
  try {
    return [{ value: JSON.parse(text.trim()), start: 0, end: text.length }];
  } catch {
    /* 説明文が混ざっている・途中で切れている場合は下で候補を探す */
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString) {
        if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try {
            found.push({ value: JSON.parse(text.slice(i, j + 1)), start: i, end: j });
          } catch {
            /* この候補は不正。次の '{' から探し直す */
          }
          break;
        }
      }
    }
  }
  return found;
}

/** 応答テキストに含まれるJSONオブジェクトを出現順に全部返す（入れ子の内側も含む）。
 * 外側が途中で切れている応答から、完成している部分だけを拾い直すのに使う。 */
export function extractJsonObjects(raw: string): unknown[] {
  return scanJsonCandidates(stripFence(raw)).map((c) => c.value);
}

/** 応答テキストからJSONオブジェクトを1つ取り出す。他のオブジェクトの内側に入っていない候補のうち、
 * 最後に現れたものを返す（説明文→検索→最終回答の順に並ぶため）。無ければnull。 */
export function extractJsonObject(raw: string): unknown | null {
  const candidates = scanJsonCandidates(stripFence(raw));
  const outermost = candidates.filter((c) => !candidates.some((o) => o !== c && o.start < c.start && c.end <= o.end));
  const pick = outermost.length > 0 ? outermost : candidates;
  return pick.length > 0 ? pick[pick.length - 1].value : null;
}

/** 栄養価のJSONをMealEstimateに整える。数値が文字列で返ってきても受け付け、PFCの欠落は0扱いにする
 * （記録自体は成立させたいため）。カロリーが数値として読めないものだけ不正としてnullを返す。 */
export function toMealEstimate(parsed: unknown): MealEstimate | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const calories = Number(o.calories);
  if (!Number.isFinite(calories)) return null;
  return {
    description: typeof o.description === "string" ? o.description : "",
    calories,
    protein_g: num(o.protein_g),
    fat_g: num(o.fat_g),
    carb_g: num(o.carb_g),
  };
}
