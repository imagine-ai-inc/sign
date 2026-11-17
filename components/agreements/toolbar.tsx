"use client";
import { useRouter } from "next/navigation";
import { Search, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Menu, MenuTrigger, MenuContent } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import type { Row } from "@/components/agreements/table";

export interface Filters { q: string; range: string; status: string[]; from: string; sort: string; dir: "asc" | "desc" }

const RANGES = [["all", "All dates"], ["24h", "Last 24 hours"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["6mo", "Last 6 months"], ["12mo", "Last 12 months"]];
const STATUSES = [["need_to_sign", "Need to sign"], ["waiting", "Waiting for others"], ["completed", "Completed"], ["declined", "Declined"], ["voided", "Voided"], ["expired", "Expired"], ["draft", "Draft"]];

export function buildQuery(base: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
  return `/agreements?${p.toString()}`;
}

export function AgreementsToolbar({ title, scope, folder, total, filters, users, rows }: { title: string; scope: "mine" | "team"; folder: string; total: number; filters: Filters; users: { id: string; name: string }[]; rows: Row[] }) {
  const router = useRouter();
  const go = (patch: Partial<Record<string, string>>) => router.push(buildQuery({ folder, scope, q: filters.q, range: filters.range === "all" ? "" : filters.range, status: filters.status.join(","), from: filters.from, sort: filters.sort === "last_change" ? "" : filters.sort, dir: filters.dir === "desc" ? "" : filters.dir, ...patch }));
  const chips: { label: string; clear: Partial<Record<string, string>> }[] = [];
  if (filters.range !== "all") chips.push({ label: RANGES.find((r) => r[0] === filters.range)?.[1] || filters.range, clear: { range: "" } });
  for (const s of filters.status) chips.push({ label: STATUSES.find((x) => x[0] === s)?.[1] || s, clear: { status: filters.status.filter((x) => x !== s).join(",") } });
  if (filters.from) chips.push({ label: `From: ${users.find((u) => u.id === filters.from)?.name || "user"}`, clear: { from: "" } });
  if (filters.q) chips.push({ label: `"${filters.q}"`, clear: { q: "" } });

  function exportCsv() {
    const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [["Subject", "Envelope ID", "Status", "Sender", "Recipients", "Sent", "Completed", "Last change"].map(esc).join(",")];
    for (const r of rows) lines.push([r.subject, r.id.toUpperCase(), r.status, `${r.ownerName} <${r.ownerEmail}>`, r.recipients.map((x) => `${x.name} <${x.email}>`).join("; "), r.sentAt || "", r.completedAt || "", r.lastActivityAt].map(esc).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `agreements-${folder}.csv`;
    a.click();
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <h1 className="text-[22px] font-semibold">{title} <span className="text-sm font-normal text-muted ml-1">{total}</span></h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="inline-flex rounded-[6px] border border-hairline overflow-hidden text-[13px]">
            <button onClick={() => go({ scope: "team" })} className={cn("px-3 py-1.5", scope === "team" ? "bg-ink text-white" : "bg-white text-ink-2 hover:bg-paper-2")}>Team</button>
            <button onClick={() => go({ scope: "mine" })} className={cn("px-3 py-1.5 border-l border-hairline", scope === "mine" ? "bg-ink text-white" : "bg-white text-ink-2 hover:bg-paper-2")}>Mine</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); go({ q: (new FormData(e.currentTarget).get("q") as string) || "" }); }} className="flex items-center h-9 w-full sm:w-[300px] order-last sm:order-none rounded-[6px] border border-hairline bg-white px-2.5 gap-2 focus-within:border-ink">
            <Search size={15} className="text-muted" />
            <input name="q" defaultValue={filters.q} placeholder="Search by subject, recipient or ID" className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted" />
          </form>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}><Download size={14} /> Export CSV</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-muted">Filters:</span>
        <NativeSelect className="h-8" value={filters.range} onChange={(e) => go({ range: e.target.value === "all" ? "" : e.target.value })}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect>
        <Menu>
          <MenuTrigger className="h-8 rounded-[6px] border border-hairline bg-white px-2.5 text-sm">Status{filters.status.length ? ` (${filters.status.length})` : ""}</MenuTrigger>
          <MenuContent align="start" className="p-2">
            {STATUSES.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-paper-2 cursor-pointer">
                <input type="checkbox" className="accent-ink" checked={filters.status.includes(k)} onChange={(e) => go({ status: (e.target.checked ? [...filters.status, k] : filters.status.filter((x) => x !== k)).join(",") })} />{l}
              </label>
            ))}
          </MenuContent>
        </Menu>
        <NativeSelect className="h-8" value={filters.from} onChange={(e) => go({ from: e.target.value })}><option value="">From: anyone</option>{users.map((u) => <option key={u.id} value={u.id}>From: {u.name}</option>)}</NativeSelect>
        {chips.map((c) => <button key={c.label} onClick={() => go(c.clear)} className="inline-flex items-center gap-1 rounded-full bg-blush-1 text-ink px-2.5 py-1 text-[12px]">{c.label}<X size={12} /></button>)}
        {chips.length ? <button onClick={() => go({ q: "", range: "", status: "", from: "" })} className="text-rose-ink hover:underline">Clear all</button> : null}
      </div>
    </div>
  );
}
