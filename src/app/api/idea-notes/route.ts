import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getIdeaNotes, createIdeaNote } from "@/lib/ideaNotes";
import type { IdeaNoteColor } from "@/lib/types";

const MAX_BYTES = 8 * 1024 * 1024;
const COLORS: IdeaNoteColor[] = ["yellow", "blue", "green", "pink", "purple"];

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const notes = await getIdeaNotes(session.profile_id);
    return NextResponse.json({ notes });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const form = await req.formData();
    const content = String(form.get("content") ?? "").trim();
    const colorRaw = String(form.get("color") ?? "yellow");
    const color = (COLORS as string[]).includes(colorRaw) ? (colorRaw as IdeaNoteColor) : "yellow";
    const file = form.get("image");

    if (!content && !(file instanceof File)) throw new ApiError(400, "メモか写真のどちらかを入力してください。");

    let photoDataUrl: string | null = null;
    if (file instanceof File) {
      if (file.size > MAX_BYTES) throw new ApiError(400, "画像サイズが大きすぎます");
      const buf = Buffer.from(await file.arrayBuffer());
      photoDataUrl = `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
    }

    const note = await createIdeaNote(session.profile_id, { content, photo_data_url: photoDataUrl, color });
    return NextResponse.json({ note });
  } catch (e) {
    return errorResponse(e);
  }
}
