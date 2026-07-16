import { NextResponse } from "next/server";
import { getProfileBySlug } from "@/lib/pinAuth";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const profile = await getProfileBySlug(slug);
  const name = profile ? profile.name : slug;

  const manifest = {
    name: `坂家 家計フローダッシュボード（${name}）`,
    short_name: "家計フロー",
    description: "坂家の家計フローダッシュボード",
    start_url: `/${slug}/app`,
    scope: `/${slug}/`,
    display: "standalone",
    background_color: "#101418",
    theme_color: "#101418",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "クイック入力",
        short_name: "入力",
        description: "支出をすぐに記録する",
        url: `/${slug}/quick`,
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };

  return NextResponse.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
