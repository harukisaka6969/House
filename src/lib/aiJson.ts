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

/** 応答テキストからJSONオブジェクトを取り出す。文字列リテラル内の波括弧を考慮して対応を取り、
 * 有効なJSONのうち最後に現れたものを返す（説明文→検索→最終回答の順に並ぶため）。無ければnull。 */
export function extractJsonObject(raw: string): unknown | null {
  const text = stripFence(raw);
  try {
    return JSON.parse(text.trim());
  } catch {
    /* 説明文が混ざっている場合は下で候補を探す */
  }
  let found: unknown | null = null;
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
            found = JSON.parse(text.slice(i, j + 1));
          } catch {
            /* この候補は不正。次の '{' から探し直す */
          }
          i = j;
          break;
        }
      }
    }
  }
  return found;
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
