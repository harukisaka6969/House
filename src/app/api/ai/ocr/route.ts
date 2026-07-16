import { NextResponse } from "next/server";
import { requireSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { ocrReceipt } from "@/lib/anthropic";
import { getAllCategories } from "@/lib/categories";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const limited = rateLimit(`ai:${session.profile_id}`, 60, 60 * 60 * 1000);
    if (!limited.ok) throw new ApiError(429, "AI機能の利用回数上限に達しました。しばらくしてから再試行してください。");

    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) throw new ApiError(400, "画像が指定されていません");
    if (file.size > MAX_BYTES) throw new ApiError(400, "画像サイズが大きすぎます");

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");
    const categories = await getAllCategories();
    const result = await ocrReceipt(base64, file.type || "image/jpeg", categories);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
