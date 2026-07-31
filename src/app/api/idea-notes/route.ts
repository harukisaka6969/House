import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getIdeaNotesForBoard, getSharedIdeaNotes, searchIdeaNotes, getIdeaNoteLinks, createIdeaNote } from "@/lib/ideaNotes";
import { getIdeaBoards, getIdeaBoard } from "@/lib/ideaBoards";
import { getAllProfiles, findPartnerOwner, makeNameLookup } from "@/lib/profiles";
import type { IdeaNoteColor, IdeaNoteRow } from "@/lib/types";

const MAX_BYTES = 8 * 1024 * 1024;
const COLORS: IdeaNoteColor[] = ["yellow", "blue", "green", "pink", "purple"];

export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const boardId = searchParams.get("board_id");
    const shared = searchParams.get("shared") === "1";
    const q = searchParams.get("q")?.trim();

    const profiles = await getAllProfiles();
    const partner = findPartnerOwner(profiles, session.profile_id);
    const nameOf = makeNameLookup(profiles);
    const myBoards = await getIdeaBoards(session.profile_id);
    const boardNameOf = new Map(myBoards.map((b) => [b.id, b.name]));

    let rows: IdeaNoteRow[];
    if (q) {
      rows = await searchIdeaNotes(session.profile_id, partner?.id ?? null, q);
    } else if (shared) {
      rows = await getSharedIdeaNotes(session.profile_id, partner?.id ?? null);
    } else if (boardId) {
      rows = await getIdeaNotesForBoard(boardId, session.profile_id);
    } else {
      throw new ApiError(400, "board_id, shared, または q のいずれかを指定してください。");
    }

    const links = await getIdeaNoteLinks(rows.map((n) => n.id));

    const notes = rows.map((n) => ({
      id: n.id,
      owner: n.owner,
      owner_name: nameOf(n.owner),
      board_id: n.board_id,
      board_name: n.owner === session.profile_id ? boardNameOf.get(n.board_id) ?? null : null,
      title: n.title,
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
    const boardId = String(form.get("board_id") ?? "");
    const title = String(form.get("title") ?? "").trim();
    const content = String(form.get("content") ?? "").trim();
    const colorRaw = String(form.get("color") ?? "yellow");
    const color = (COLORS as string[]).includes(colorRaw) ? (colorRaw as IdeaNoteColor) : "yellow";
    const x = Number(form.get("x") ?? 0) || 0;
    const y = Number(form.get("y") ?? 0) || 0;
    const file = form.get("image");

    if (!boardId) throw new ApiError(400, "board_id is required");
    const board = await getIdeaBoard(boardId);
    if (!board || board.owner !== session.profile_id) throw new ApiError(404, "ボードが見つかりません。");

    if (!title && !content && !(file instanceof File)) throw new ApiError(400, "タイトル・メモ・写真のいずれかを入力してください。");

    let photoDataUrl: string | null = null;
    if (file instanceof File) {
      if (file.size > MAX_BYTES) throw new ApiError(400, "画像サイズが大きすぎます");
      const buf = Buffer.from(await file.arrayBuffer());
      photoDataUrl = `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
    }

    const note = await createIdeaNote(session.profile_id, { board_id: boardId, title, content, photo_data_url: photoDataUrl, color, x, y });
    return NextResponse.json({ note });
  } catch (e) {
    return errorResponse(e);
  }
}
