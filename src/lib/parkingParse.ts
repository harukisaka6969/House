import { extractJsonObjects } from "./aiJson";

/**
 * 駐車場提案（車移動セクション）のAI応答を解析する部分。純粋関数のみなのでテストから直接読める。
 * Web検索つきの応答は説明文が混ざる・トークン上限で途中で切れることがあり、素直にJSON.parseすると
 * optionsが空になって「駐車場情報が見つかりませんでした」と表示されてしまうため、ここで粘って拾う。
 */

export interface ParkingOption {
  type: string;
  name: string;
  estimated_cost: number;
  walk_minutes: number | null;
  notes: string;
  timing_advice: string | null;
}

export interface ParkingResearch {
  destination: string;
  options: ParkingOption[];
  general_notes: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 1件の提案らしいオブジェクトか（途中で切れた応答から拾い直すときの判定に使う）。 */
function looksLikeOption(o: Record<string, unknown>): boolean {
  const hasName = typeof o.name === "string" && o.name.trim() !== "";
  const hasType = typeof o.type === "string" && o.type.trim() !== "";
  const hasCost = o.estimated_cost !== undefined && Number.isFinite(Number(o.estimated_cost));
  return (hasName || hasType) && (hasCost || typeof o.notes === "string");
}

function toOption(o: Record<string, unknown>): ParkingOption {
  const walk = Number(o.walk_minutes);
  return {
    type: typeof o.type === "string" && o.type.trim() !== "" ? o.type : "駐車方法",
    name: typeof o.name === "string" ? o.name : "",
    estimated_cost: Math.max(0, Math.round(Number(o.estimated_cost) || 0)),
    walk_minutes: Number.isFinite(walk) && walk > 0 ? Math.round(walk) : null,
    notes: typeof o.notes === "string" ? o.notes : "",
    timing_advice: typeof o.timing_advice === "string" && o.timing_advice.trim() !== "" ? o.timing_advice : null,
  };
}

/**
 * 応答テキストからParkingResearchを組み立てる。
 * 1. options配列を持つオブジェクトがあればそれを採用する（正常な応答）。
 * 2. 無ければ、応答中に散らばっている「提案らしいオブジェクト」を拾って組み立てる
 *    （外側のJSONが途中で切れた応答の救済）。
 * どちらでも1件も取れなければnullを返し、呼び出し側でやり直す。
 */
export function parseParkingResearch(raw: string, fallbackDestination: string): ParkingResearch | null {
  const objects = extractJsonObjects(raw);

  const withOptions = objects.filter((o): o is Record<string, unknown> => isRecord(o) && Array.isArray(o.options));
  // optionsの件数が多いものを優先（途中で切れて件数が少ない候補より、完成している候補を採る）。
  const best = withOptions.sort((a, b) => (b.options as unknown[]).length - (a.options as unknown[]).length)[0];

  if (best) {
    const options = (best.options as unknown[]).filter(isRecord).map(toOption);
    if (options.length > 0) {
      return {
        destination: typeof best.destination === "string" && best.destination.trim() !== "" ? best.destination : fallbackDestination,
        options,
        general_notes: typeof best.general_notes === "string" ? best.general_notes : "",
      };
    }
  }

  const recovered = objects.filter(isRecord).filter(looksLikeOption).map(toOption);
  if (recovered.length > 0) {
    const destination = objects.find((o): o is Record<string, unknown> => isRecord(o) && typeof o.destination === "string");
    return {
      destination: destination ? (destination.destination as string) : fallbackDestination,
      options: recovered,
      general_notes: "",
    };
  }

  return null;
}
