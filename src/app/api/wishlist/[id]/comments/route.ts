import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { addWishlistComment } from "@/lib/wishlistComments";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";

const bodySchema = z.object({ body: z.string().min(1).max(500) });

/** 登録者本人でなくても（非公開アイテムでない限り）コメントできる。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const { body } = bodySchema.parse(await req.json());

    const comment = await addWishlistComment(id, session.profile_id, body);
    if (!comment) throw new ApiError(404, "対象のアイテムが見つからないか、コメントできません");

    const profiles = await getAllProfiles();
    const nameOf = makeNameLookup(profiles);
    return NextResponse.json({ comment: { ...comment, owner_name: nameOf(comment.owner) } });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
