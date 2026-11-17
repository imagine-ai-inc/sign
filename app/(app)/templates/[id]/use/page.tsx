import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/services/access";
import { getTemplate } from "@/lib/services/templates";
import { getBundle } from "@/lib/services/envelopes";
import { UseTemplateForm } from "@/components/templates/use-form";

export default async function UseTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  let t;
  try { t = await getTemplate(user, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const b = await getBundle(t.envelopeId);
  return (
    <main className="max-w-[760px] mx-auto px-6 py-6">
      <Link href="/templates" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft size={16} /> Templates</Link>
      <div className="mt-3 rounded-lg bg-white border border-hairline p-6">
        <h1 className="text-[22px] font-semibold">{t.name}</h1>
        <p className="text-sm text-muted mt-1">{t.description || `${b.documents.length} document${b.documents.length === 1 ? "" : "s"}: ${b.documents.map((d) => d.name).join(", ")}`}</p>
        <UseTemplateForm
          templateId={t.id}
          subject={b.envelope.subject}
          message={b.envelope.message}
          roles={b.recipients.map((r) => ({ id: r.id, role: r.templateRole || r.name || `${r.role} ${r.position + 1}`, kind: r.role, routingOrder: r.routingOrder, defaultName: r.name, defaultEmail: r.email }))}
          signingOrder={b.envelope.signingOrder}
        />
      </div>
    </main>
  );
}
