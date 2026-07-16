// 表示キャッシュのみ（アイコン・マニフェストなどの静的アセット）。
// API応答やページのSSR結果はキャッシュしない — 家計データは常に最新を取得する。
const CACHE = "kakeibo-shell-v1";
const ASSETS = ["/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return; // データは絶対にキャッシュしない
  if (!ASSETS.includes(url.pathname)) return; // ページ本体もキャッシュしない（常に最新の家計データを表示するため）

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
