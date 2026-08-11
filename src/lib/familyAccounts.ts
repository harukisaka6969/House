import "server-only";
import { db } from "./db";
import { hashPin, type AuthMethod } from "./pinAuth";

export interface FamilyAccountRow {
  id: string;
  slug: string;
  name: string;
  auth_method: AuthMethod;
  created_at: string;
}

export async function listFamilyAccounts(): Promise<FamilyAccountRow[]> {
  const { data, error } = await db()
    .from("profiles")
    .select("id, slug, name, auth_method, created_at")
    .eq("role", "family")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FamilyAccountRow[];
}

export class SlugTakenError extends Error {}

export async function createFamilyAccount(
  slug: string,
  name: string,
  credential: string,
  authMethod: AuthMethod = "pin"
): Promise<FamilyAccountRow> {
  const pin_hash = await hashPin(credential);
  const { data, error } = await db()
    .from("profiles")
    .insert({ slug, name, pin_hash, auth_method: authMethod, role: "family" })
    .select("id, slug, name, auth_method, created_at")
    .single();
  if (error) {
    if (error.code === "23505") throw new SlugTakenError(`slug "${slug}" is already in use`);
    throw error;
  }
  return data as FamilyAccountRow;
}

export async function deleteFamilyAccount(id: string): Promise<boolean> {
  const { data, error } = await db().from("profiles").delete().eq("id", id).eq("role", "family").select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function resetFamilyPin(id: string, newCredential: string, authMethod: AuthMethod = "pin"): Promise<boolean> {
  const pin_hash = await hashPin(newCredential);
  const { data, error } = await db()
    .from("profiles")
    .update({ pin_hash, auth_method: authMethod, failed_attempts: 0, locked_until: null })
    .eq("id", id)
    .eq("role", "family")
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
