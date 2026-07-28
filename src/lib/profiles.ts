import "server-only";
import { db } from "./db";
import type { Profile } from "./types";

let cache: Profile[] | null = null;

export async function getAllProfiles(): Promise<Profile[]> {
  if (cache) return cache;
  const { data, error } = await db().from("profiles").select("id, slug, name, role");
  if (error) throw error;
  cache = (data ?? []) as Profile[];
  return cache;
}

/** The other owner profile (never a family viewer profile) — used for "partner" lookups. */
export function findPartnerOwner(profiles: Profile[], viewerProfileId: string): Profile | null {
  return profiles.find((p) => p.role === "owner" && p.id !== viewerProfileId) ?? null;
}

export async function profileNameOf(profileId: string | null): Promise<string> {
  if (!profileId) return "共有";
  const profiles = await getAllProfiles();
  return profiles.find((p) => p.id === profileId)?.name ?? "？";
}

export function makeNameLookup(profiles: Profile[]): (profileId: string) => string {
  const map = new Map(profiles.map((p) => [p.id, p.name]));
  return (id: string) => map.get(id) ?? "？";
}

export async function findProfileBySlug(slug: string): Promise<Profile | null> {
  const profiles = await getAllProfiles();
  return profiles.find((p) => p.slug === slug) ?? null;
}
