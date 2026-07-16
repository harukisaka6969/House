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

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "internal error" }, { status: 500 });
}
