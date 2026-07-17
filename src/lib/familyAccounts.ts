import "server-only";
import { db } from "./db";
import { hashPin } from "./pinAuth";

export interface FamilyAccountRow {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}

export async function listFamilyAccounts(): Promise<FamilyAccountRow[]> {
  const { data, error } = await db()
    .from("profiles")
    .select("id, slug, name, created_at")
    .eq("role", "family")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FamilyAccountRow[];
}

export class SlugTakenError extends Error {}

export async function createFamilyAccount(slug: string, name: string, pin: string): Promise<FamilyAccountRow> {
  const pin_hash = await hashPin(pin);
  const { data, error } = await db()
    .from("profiles")
    .insert({ slug, name, pin_hash, role: "family" })
    .select("id, slug, name, created_at")
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

export async function resetFamilyPin(id: string, newPin: string): Promise<boolean> {
  const pin_hash = await hashPin(newPin);
  const { data, error } = await db()
    .from("profiles")
    .update({ pin_hash, failed_attempts: 0, locked_until: null })
    .eq("id", id)
    .eq("role", "family")
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
