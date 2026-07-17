import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "kakeibo_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface SessionPayload {
  profile_id: string;
  slug: string;
  role: "owner" | "family";
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is not configured (needs 32+ bytes)");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.profile_id !== "string" ||
      typeof payload.slug !== "string" ||
      (payload.role !== "owner" && payload.role !== "family")
    ) {
      return null;
    }
    return { profile_id: payload.profile_id, slug: payload.slug, role: payload.role };
  } catch {
    return null;
  }
}

/** Reads and verifies the session cookie for the current request. Server Components / Route Handlers only. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/* ---- WebAuthn challenge: short-lived, stored in its own signed cookie so it
   survives across the register/login-options -> verify round trip without
   needing server-side session storage (works fine on serverless). ---- */
const CHALLENGE_COOKIE = "kakeibo_webauthn_challenge";
const CHALLENGE_TTL_SECONDS = 5 * 60;

interface ChallengePayload {
  challenge: string;
  profile_id: string;
  purpose: "register" | "login";
}

export async function setChallengeCookie(payload: ChallengePayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_TTL_SECONDS}s`)
    .sign(secretKey());
  const store = await cookies();
  store.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
  });
}

export async function consumeChallengeCookie(): Promise<ChallengePayload | null> {
  const store = await cookies();
  const token = store.get(CHALLENGE_COOKIE)?.value;
  store.delete(CHALLENGE_COOKIE); // one-time use: prevents replay
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.challenge !== "string" ||
      typeof payload.profile_id !== "string" ||
      (payload.purpose !== "register" && payload.purpose !== "login")
    ) {
      return null;
    }
    return { challenge: payload.challenge, profile_id: payload.profile_id, purpose: payload.purpose };
  } catch {
    return null;
  }
}
