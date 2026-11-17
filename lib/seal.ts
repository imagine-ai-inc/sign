import "server-only";
import { sql } from "@/lib/db";
import { brand } from "@/lib/brand";
import { env } from "@/lib/env";
import { sealFromEnv } from "@/lib/pdf";
import { generateSelfSignedP12 } from "@/lib/pdf/cert";
import type { SealOptions } from "@/lib/pdf/types";

/**
 * The PAdES seal applied to every completed PDF.
 * 1) SEAL_P12_BASE64 / SEAL_P12_PASSPHRASE env (bring your own or a paid AATL cert), else
 * 2) a self-signed certificate generated once on first use and kept in sign.instance_secrets.
 * Set SEAL_AUTO_GENERATE=false to skip sealing entirely when no env cert is configured.
 */
export async function loadSeal(): Promise<SealOptions | null> {
  const fromEnv = sealFromEnv();
  if (fromEnv) return fromEnv;
  if (/^(0|false|off|no)$/i.test(process.env.SEAL_AUTO_GENERATE ?? "")) return null;
  let row = await readStored();
  if (!row) {
    const g = generateSelfSignedP12({ commonName: brand.name, organization: brand.company || brand.name, email: env.supportEmail() || undefined });
    await sql`insert into sign.instance_secrets (name, value, passphrase) values ('seal_p12', ${Buffer.from(g.p12).toString("base64")}, ${g.passphrase}) on conflict (name) do nothing`;
    row = await readStored(); // another request may have won the race; use whatever is stored
  }
  if (!row) return null;
  return {
    p12: new Uint8Array(Buffer.from(row.value, "base64")),
    passphrase: row.passphrase,
    name: brand.company || brand.name,
    reason: `Signed and sealed by ${brand.name}`,
    location: process.env.SEAL_LOCATION ?? "",
    contactInfo: env.supportEmail(),
  };
}

async function readStored() {
  const [row] = await sql<{ value: string; passphrase: string }[]>`select value, passphrase from sign.instance_secrets where name = 'seal_p12'`;
  return row ?? null;
}
