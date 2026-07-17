/**
 * Seeds the two fixed household profiles (haruki / arisa) with an initial PIN.
 * Run once against a fresh DB (accounts are already inserted by migration 0001).
 *
 *   SEED_HARUKI_PIN=123456 SEED_ARISA_PIN=654321 npx tsx scripts/seed.ts
 *
 * Change both PINs from the app's settings screen immediately after first login.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { hashPin } from "../src/lib/pinHash";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const seeds = [
    { slug: "haruki", name: "ハルキ", pin: process.env.SEED_HARUKI_PIN ?? randomPin() },
    { slug: "arisa", name: "アリサ", pin: process.env.SEED_ARISA_PIN ?? randomPin() },
  ];

  for (const s of seeds) {
    const { data: existing, error: selErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("slug", s.slug)
      .maybeSingle();
    if (selErr) throw selErr;
    if (existing) {
      console.log(`skip: /${s.slug} already exists`);
      continue;
    }
    const pin_hash = await hashPin(s.pin);
    const { error: insErr } = await supabase.from("profiles").insert({ slug: s.slug, name: s.name, pin_hash });
    if (insErr) throw insErr;
    console.log(`created /${s.slug} (${s.name}) — initial PIN: ${s.pin}`);
  }

  console.log("\nDone. Log in at /haruki and /arisa with the PINs above, then register a passkey and change the PIN from settings.");
}

function randomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
