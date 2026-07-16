import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "kakeibo_session";

/**
 * Defense-in-depth for page routes: /{slug}/app and /{slug}/quick require a
 * session whose slug matches the URL slug (spec §3.4 — Haruki's session must
 * never be able to open /arisa). Route handlers under /api also enforce this
 * independently via requireSession(); this middleware protects the page shell.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const match = pathname.match(/^\/([^/]+)\/(app|quick)(\/.*)?$/);
  if (!match) return NextResponse.next();
  const slug = match[1];

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) {
    return NextResponse.redirect(new URL(`/${slug}`, req.url));
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.slug !== slug) {
      return NextResponse.redirect(new URL(`/${slug}`, req.url));
    }
  } catch {
    return NextResponse.redirect(new URL(`/${slug}`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:slug/app/:path*", "/:slug/quick/:path*"],
};
