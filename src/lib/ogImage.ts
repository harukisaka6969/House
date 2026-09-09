import "server-only";

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 300 * 1024;

const OG_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
];

/** 商品ページ等のURLからOGP画像（無ければtwitter:image）を取得する。ページ取得失敗・
 * タグが無い等はすべてベストエフォートでnullを返す（ウィッシュリスト登録自体は失敗させない）。 */
export async function fetchOgImage(pageUrl: string): Promise<string | null> {
  try {
    const u = new URL(pageUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(u.toString(), {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HouseWishlistBot/1.0)" },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});

    let match: RegExpMatchArray | null = null;
    for (const pattern of OG_IMAGE_PATTERNS) {
      match = html.match(pattern);
      if (match) break;
    }
    if (!match) return null;

    const raw = match[1].replace(/&amp;/g, "&");
    return new URL(raw, u).toString();
  } catch {
    return null;
  }
}
