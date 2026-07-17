import "server-only";
import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "./session";

export class ApiError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

/** Requires a valid session. If `slug` is given, the session's slug must match it exactly — this is what stops Haruki's session from opening /arisa's data (spec §3.4). */
export async function requireSession(slug?: string): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "認証が必要です");
  if (slug && session.slug !== slug) throw new ApiError(403, "このアカウントにはアクセスできません");
  return session;
}

/** Owner-only data APIs (v2 spec §5.4): a family-role session gets 403 on every financial-data endpoint. */
export async function requireOwnerSession(slug?: string): Promise<SessionPayload> {
  const session = await requireSession(slug);
  if (session.role !== "owner") throw new ApiError(403, "この操作には権限がありません");
  return session;
}

/** Family-role read-only APIs (v2 spec §5.4): only a family session may call these; owners use their own full-data routes. */
export async function requireFamilySession(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "family") throw new ApiError(403, "この操作には権限がありません");
  return session;
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "internal error" }, { status: 500 });
}
