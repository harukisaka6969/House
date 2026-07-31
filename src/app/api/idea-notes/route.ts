import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getIdeaNotes, getIdeaNoteLinks, createIdeaNote } from "@/lib/ideaNotes";
import { getAllProfiles, findPartnerOwner, makeNameLookup } from "@/lib/profiles";
import type { IdeaNoteColor } from "@/lib/types";

const MAX_BYTES = 8 * 1024 * 1024;
const COLORS: IdeaNoteColor[] = ["yellow", "blue", "green", "pink", "purple"];

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const profiles = await getAllProfiles();
    const partner = findPartnerOwner(profiles, session.profile_id);
    const nameOf = makeNameLookup(profiles);

    const rows = await getIdeaNotes(session.profile_id, partner?.id ?? null);
    const links = await getIdeaNoteLinks(rows.map((n) => n.id));

    const notes = rows.map((n) => ({
      id: n.id,
      owner: n.owner,
      owner_name: nameOf(n.owner),
      content: n.content,
      photo_data_url: n.photo_data_url,
      color: n.color,
      x: n.x,
      y: n.y,
      visibility: n.visibility,
      mine: n.owner === session.profile_id,
      created_at: n.created_at,
    }));

    return NextResponse.json({ notes, links: links.map((l) => ({ id: l.id, from_note: l.from_note, to_note: l.to_note })) });
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
    const x = Number(form.get("x") ?? 0) || 0;
    const y = Number(form.get("y") ?? 0) || 0;
    const file = form.get("image");

    if (!content && !(file instanceof File)) throw new ApiError(400, "メモか写真のどちらかを入力してください。");

    let photoDataUrl: string | null = null;
    if (file instanceof File) {
      if (file.size > MAX_BYTES) throw new ApiError(400, "画像サイズが大きすぎます");
      const buf = Buffer.from(await file.arrayBuffer());
      photoDataUrl = `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
    }

    const note = await createIdeaNote(session.profile_id, { content, photo_data_url: photoDataUrl, color, x, y });
    return NextResponse.json({ note });
  } catch (e) {
    return errorResponse(e);
  }
}
