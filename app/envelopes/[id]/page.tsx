import { redirect } from "next/navigation";
import { sql } from "@/lib/db";

export default async function EnvelopeIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [e] = /^[0-9a-f-]{36}$/i.test(id) ? await sql<{ status: string }[]>`select status from sign.envelopes where id = ${id}` : [];
  if (!e) redirect("/agreements");
  redirect(e.status === "draft" || e.status === "template" ? `/envelopes/${id}/prepare` : `/agreements/${id}`);
}
