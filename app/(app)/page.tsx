import Link from "next/link";
import { FileSignature, Send } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { folderCounts, listEnvelopes } from "@/lib/services/envelopes";
import { listTemplates } from "@/lib/services/templates";
import { StartDropzone } from "@/components/home/start-dropzone";
import { MySignatureCard } from "@/components/home/signature-editor";
import { EnvelopeStatus } from "@/components/status";
import { fmtList } from "@/lib/format";
import { signMyselfAction } from "@/lib/actions/manage";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const user = await requireUser();
  const [counts, recent, templates] = await Promise.all([folderCounts(user), listEnvelopes(user, { folder: "all", limit: 8 }), listTemplates(user)]);
  const first = (user.name || "").split(" ")[0] || "there";
  const tiles = [
    { label: "Action Required", value: counts.actionRequired, href: "/agreements?folder=action_required" },
    { label: "Waiting for Others", value: counts.waiting, href: "/agreements?folder=waiting" },
    { label: "Expiring Soon", value: counts.expiring, href: "/agreements?folder=expiring" },
    { label: "Completed", value: counts.completed, href: "/agreements?folder=completed" },
  ];
  const sig = user.signature ? { fullName: user.signature.fullName, initials: user.signature.initials, adoptedAt: user.signature.adoptedAt } : null;
  return (
    <main className="max-w-[1180px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="font-serif text-[34px] leading-none mb-6">Welcome back, {first}</h1>
      <section className="grid lg:grid-cols-[1.25fr_1fr] gap-6">
        <div className="rounded-xl bg-white border border-hairline overflow-hidden">
          <div className="grid sm:grid-cols-2 border-b border-hairline-2">
            <form action={signMyselfAction} className="p-5 border-b sm:border-b-0 sm:border-r border-hairline-2">
              <button type="submit" className="w-full text-left group">
                <div className="h-9 w-9 rounded-full bg-blush-1 flex items-center justify-center text-rose-ink"><FileSignature size={18} /></div>
                <div className="mt-3 font-semibold group-hover:underline">Sign a document</div>
                <div className="text-[13px] text-muted mt-0.5">Upload a document and sign it yourself.</div>
              </button>
            </form>
            <Link href="/agreements?start=1" className="p-5 group">
              <div className="h-9 w-9 rounded-full bg-blush-1 flex items-center justify-center text-rose-ink"><Send size={18} /></div>
              <div className="mt-3 font-semibold group-hover:underline">Get signatures</div>
              <div className="text-[13px] text-muted mt-0.5">Send a document for others to sign.</div>
            </Link>
          </div>
          <div className="p-6"><StartDropzone templates={templates.slice(0, 6).map((t) => ({ id: t.id, name: t.name }))} /></div>
        </div>
        <div className="space-y-6">
          <div className="rounded-xl bg-white border border-hairline">
            <div className="px-5 py-4 border-b border-hairline-2 font-semibold">Overview</div>
            <div className="grid grid-cols-2">
              {tiles.map((t, i) => (
                <Link key={t.label} href={t.href} className={"px-5 py-4 hover:bg-paper/60 " + (i % 2 === 0 ? "border-r border-hairline-2 " : "") + (i < 2 ? "border-b border-hairline-2" : "")}>
                  <div className="text-[28px] font-semibold leading-none">{t.value}</div>
                  <div className="text-[12.5px] text-ink-2 mt-1.5">{t.label}</div>
                </Link>
              ))}
            </div>
          </div>
          <MySignatureCard name={user.name || user.email} adoption={sig} />
        </div>
      </section>
      <section className="mt-6 rounded-xl bg-white border border-hairline">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline-2"><h2 className="font-semibold">Recent agreements</h2><Link href="/agreements" className="text-sm text-rose-ink hover:underline">View all</Link></div>
        {recent.rows.length === 0 ? <p className="px-5 py-10 text-sm text-muted text-center">Nothing here yet. Drop a PDF above to send your first envelope.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[12px] uppercase tracking-wide text-muted border-b border-hairline"><th className="px-5 py-2.5 font-medium">Subject</th><th className="py-2.5 font-medium w-[200px]">Status</th><th className="py-2.5 font-medium w-[170px]">Last change</th></tr></thead>
            <tbody>
              {recent.rows.map((e) => { const w = fmtList(e.lastActivityAt, user.timezone); return (
                <tr key={e.id} className="border-b border-hairline-2 last:border-0 hover:bg-paper/60">
                  <td className="px-5 py-3"><Link href={e.status === "draft" ? `/envelopes/${e.id}/prepare` : `/agreements/${e.id}`} className="font-medium hover:underline">{e.subject || "Untitled envelope"}</Link><div className="text-xs text-muted">To: {e.recipients.map((r) => r.name).filter(Boolean).join(", ") || "No recipients yet"}</div></td>
                  <td className="py-3"><EnvelopeStatus status={e.status} myAction={e.myAction} /></td>
                  <td className="py-3 text-ink-2">{w.date} <span className="text-muted text-xs">{w.time}</span></td>
                </tr>); })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
