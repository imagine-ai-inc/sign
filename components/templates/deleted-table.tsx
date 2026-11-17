"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { restoreTemplateAction } from "@/lib/actions/manage";
import { fmtDate } from "@/lib/format";

export function DeletedTemplatesTable({ rows, timezone }: { rows: { id: string; name: string; ownerName: string; deletedAt: string }[]; timezone: string }) {
  const router = useRouter();
  return (
    <div className="rounded-lg bg-white border border-hairline">
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
        <thead><tr className="text-left text-[12px] uppercase tracking-wide text-muted border-b border-hairline"><th className="px-4 py-2.5 font-medium">Name</th><th className="py-2.5 font-medium w-[160px]">Owner</th><th className="py-2.5 font-medium w-[140px]">Deleted</th><th className="w-[120px]"></th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={4} className="px-4 py-16 text-center text-muted">No deleted templates.</td></tr> : rows.map((t) => (
            <tr key={t.id} className="border-b border-hairline-2 last:border-0"><td className="px-4 py-3 font-medium">{t.name}</td><td className="py-3 text-ink-2">{t.ownerName}</td><td className="py-3 text-ink-2">{fmtDate(t.deletedAt, timezone)}</td><td className="py-2.5 pr-4 text-right"><Button size="sm" variant="secondary" onClick={async () => { await restoreTemplateAction(t.id); router.refresh(); }}>Restore</Button></td></tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
