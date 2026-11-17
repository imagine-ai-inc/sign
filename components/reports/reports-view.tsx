"use client";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Period, ReportSummary, SenderRow } from "@/lib/services/reports";

const PERIODS: { key: Period; label: string }[] = [{ key: "30d", label: "Last 30 days" }, { key: "90d", label: "Last 90 days" }, { key: "12mo", label: "Last 12 months" }, { key: "all", label: "All time" }];

function hours(h: number | null) {
  if (h === null || Number.isNaN(h)) return "–";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

function csvOf(rows: string[][]) {
  return rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function ReportsView({ period, summary, senders, months }: { period: Period; summary: ReportSummary; senders: SenderRow[]; months: { month: string; sent: number; completed: number }[] }) {
  const cards = [
    { label: "Envelopes sent", value: summary.sent },
    { label: "Completed", value: summary.completed },
    { label: "Completion rate", value: summary.completionRate === null ? "–" : `${Math.round(summary.completionRate * 100)}%` },
    { label: "Average time to complete", value: hours(summary.avgHours) },
    { label: "In progress", value: summary.inProgress },
    { label: "Declined / voided / expired", value: `${summary.declined} / ${summary.voided} / ${summary.expired}` },
  ];
  function exportCsv() {
    const csv = csvOf([["Sender", "Email", "Sent", "Completed", "In progress", "Avg hours to complete"], ...senders.map((s) => [s.name, s.email, String(s.sent), String(s.completed), String(s.inProgress), s.avgHours === null ? "" : s.avgHours.toFixed(1)])]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `imagine-sign-report-${period}.csv`;
    a.click();
  }
  const max = Math.max(1, ...months.map((m) => m.sent));
  return (
    <main className="max-w-[1180px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-[22px] font-semibold">Reports</h1>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-[6px] border border-hairline overflow-hidden text-[13px] bg-white">
            {PERIODS.map((p) => <Link key={p.key} href={`/reports?period=${p.key}`} className={cn("px-3 py-1.5 border-l first:border-l-0 border-hairline", period === p.key ? "bg-ink text-white" : "text-ink-2 hover:bg-paper-2")}>{p.label}</Link>)}
          </div>
          <Button variant="secondary" onClick={exportCsv}><Download size={15} /> Export CSV</Button>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl bg-white border border-hairline p-5">
            <div className="text-[12px] uppercase tracking-wide text-muted">{c.label}</div>
            <div className="text-[28px] font-semibold mt-1">{c.value}</div>
          </div>
        ))}
      </div>
      <section className="mt-6 rounded-xl bg-white border border-hairline">
        <div className="px-5 py-4 border-b border-hairline-2 font-semibold">Envelope volume by month</div>
        <div className="px-5 py-5">
          {months.length === 0 ? <p className="text-sm text-muted">No envelopes sent in this period.</p> : (
            <div className="flex items-end gap-3 h-[160px]">
              {months.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex items-end gap-0.5 h-[120px]">
                    <div className="flex-1 bg-blush-2 rounded-t" style={{ height: `${(m.sent / max) * 100}%` }} title={`${m.sent} sent`} />
                    <div className="flex-1 bg-rose-ink rounded-t" style={{ height: `${(m.completed / max) * 100}%` }} title={`${m.completed} completed`} />
                  </div>
                  <div className="text-[11px] text-muted truncate">{m.month}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-4 text-[11px] text-muted mt-3"><span><span className="inline-block w-3 h-3 bg-blush-2 align-middle mr-1" />Sent</span><span><span className="inline-block w-3 h-3 bg-rose-ink align-middle mr-1" />Completed</span></div>
        </div>
      </section>
      <section className="mt-6 rounded-xl bg-white border border-hairline">
        <div className="px-5 py-4 border-b border-hairline-2 font-semibold">Envelope volume by sender</div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[12px] uppercase tracking-wide text-muted border-b border-hairline"><th className="px-5 py-2.5 font-medium">Sender</th><th className="py-2.5 font-medium">Sent</th><th className="py-2.5 font-medium">Completed</th><th className="py-2.5 font-medium">In progress</th><th className="py-2.5 font-medium">Avg time to complete</th></tr></thead>
          <tbody>
            {senders.map((s) => (
              <tr key={s.userId} className="border-b border-hairline-2 last:border-0">
                <td className="px-5 py-3"><div className="font-medium">{s.name}</div><div className="text-xs text-muted">{s.email}</div></td>
                <td className="py-3">{s.sent}</td><td className="py-3">{s.completed}</td><td className="py-3">{s.inProgress}</td><td className="py-3">{hours(s.avgHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
