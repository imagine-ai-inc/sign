import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { assertEdit, AppError } from "@/lib/services/access";
import { getBundle } from "@/lib/services/envelopes";
import { FieldTagger } from "@/components/builder/field-tagger";

export const metadata = { title: "Add fields" };

export default async function FieldsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  try {
    await assertEdit(user, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const b = await getBundle(id);
  if (b.envelope.status !== "draft" && b.envelope.status !== "template") redirect(`/agreements/${id}`);
  if (!b.documents.length) redirect(`/envelopes/${id}/prepare`);
  const [template] = b.envelope.status === "template" ? await sql<{ id: string; name: string }[]>`select id, name from sign.templates where envelope_id = ${id}` : [];
  return (
    <FieldTagger
      envelopeId={id}
      subject={template?.name || b.envelope.subject || "Untitled envelope"}
      isTemplate={!!template}
      templateId={template?.id ?? null}
      documents={b.documents.map((d) => ({ id: d.id, name: d.name, fileId: d.fileId, pageCount: d.pageCount, pages: d.pages }))}
      recipients={b.recipients.filter((r) => r.status !== "replaced").map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, colorIndex: r.colorIndex, templateRole: r.templateRole, routingOrder: r.routingOrder }))}
      fields={b.fields.map((f) => ({ id: f.id, documentId: f.documentId, recipientId: f.recipientId, type: f.type, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height, required: f.required, readOnly: f.readOnly, label: f.label, options: f.options, value: f.value }))}
    />
  );
}
