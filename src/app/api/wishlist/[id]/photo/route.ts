import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { setWishlistItemImage } from "@/lib/wishlist";

const MAX_BYTES = 8 * 1024 * 1024;

/** URLからのOGP自動取得がブロックされる（Akamai等のBot対策があるブランドサイト等）場合の
 * 手動アップロード用エンドポイント。写真そのものをdata URLとして保存するので、
 * 表示時に元サイトへ再度アクセスする必要がなく確実に表示できる。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) throw new ApiError(400, "画像を指定してください");
    if (file.size > MAX_BYTES) throw new ApiError(400, "画像サイズが大きすぎます");

    const buf = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
    const item = await setWishlistItemImage(id, session.profile_id, dataUrl);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const item = await setWishlistItemImage(id, session.profile_id, null);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
