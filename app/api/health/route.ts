import { brand } from "@/lib/brand";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
export async function GET() {
  const [r] = await sql<{ ok: number }[]>`select 1 as ok`;
  return NextResponse.json({ ok: r.ok === 1, service: "imagine-sign", app: brand.name });
}
