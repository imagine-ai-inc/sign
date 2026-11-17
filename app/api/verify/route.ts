import { NextResponse } from "next/server";
import { findCompletedBySha } from "@/lib/services/settings";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { sha256?: string };
  const sha = (body.sha256 || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) return NextResponse.json({ error: { code: "bad_hash", message: "Send a SHA-256 hex digest" } }, { status: 400 });
  const env = await findCompletedBySha(sha);
  if (!env) return NextResponse.json({ match: false });
  return NextResponse.json({ match: true, envelopeId: env.id.toUpperCase(), subject: env.subject, completedAt: env.completedAt, signers: env.signers });
}
