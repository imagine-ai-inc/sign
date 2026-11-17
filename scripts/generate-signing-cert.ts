/**
 * Optional: generate your own self-signed seal certificate instead of the one the app creates on first use.
 *   pnpm tsx scripts/generate-signing-cert.ts ./seal.p12 "Acme Sign" "Acme Inc." sign@acme.com
 * Writes the .p12 to the given path (outside the repo, never commit it) and prints
 * SEAL_P12_BASE64=... and SEAL_P12_PASSPHRASE=... to stdout for your Vercel env.
 * A paid AATL certificate (so Adobe shows a green check) goes into the same two env vars.
 */
import { writeFileSync } from "node:fs";
import { generateSelfSignedP12 } from "../lib/pdf/cert";

export { generateSelfSignedP12 };

if (process.argv[1]?.includes("generate-signing-cert")) {
  const [, , out, commonName, organization, email] = process.argv;
  const { p12, passphrase } = generateSelfSignedP12({ commonName, organization, email });
  if (out) writeFileSync(out, p12, { mode: 0o600 });
  process.stdout.write(`SEAL_P12_BASE64=${Buffer.from(p12).toString("base64")}\nSEAL_P12_PASSPHRASE=${passphrase}\n`);
}
