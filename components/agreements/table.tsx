"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { EnvelopeStatus } from "@/components/status";
import { fmtList } from "@/lib/format";
import { resendEnvelopeAction, deleteEnvelopeAction, restoreEnvelopeAction, cloneEnvelopeAction } from "@/lib/actions/envelopes";
import { signNowAction, bulkDeleteAction, bulkRestoreAction } from "@/lib/actions/manage";
import { VoidDialog, SaveAsTemplateDialog, MoveToFolderDialog } from "@/components/agreements/dialogs";
import type { EnvelopeStatus as Status, RecipientRole, RecipientStatus } from "@/lib/types";

export interface Row {
  id: string; subject: string; status: Status; ownerId: string; ownerName: string; ownerEmail: string;
  sentAt: string | null; completedAt: string | null; expiresAt: string | null; lastActivityAt: string; createdAt: string; deletedAt: string | null;
  recipients: { id: string; name: string; email: string; role: RecipientRole; status: RecipientStatus; routingOrder: number }[];
  myAction: boolean;
}

export function AgreementsTable(p: { rows: Row[]; folders: { id: string; name: string }[]; timezone: string; userId: string; folder: string; total: number; page: number; limit: number; q: string; scope: string; sort?: string; dir?: "asc" | "desc"; extra?: Record<string, string> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ kind: "void" | "template" | "move"; ids: string[]; name?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = p.rows.length > 0 && p.rows.every((r) => selected.has(r.id));
  const pages = Math.max(1, Math.ceil(p.total / p.limit));
  const qs = (patch: Record<string, string | undefined>) => { const u = new URLSearchParams({ folder: p.folder, scope: p.scope, ...(p.q ? { q: p.q } : {}), ...(p.sort && p.sort !== "last_change" ? { sort: p.sort } : {}), ...(p.dir === "asc" ? { dir: "asc" } : {}), ...Object.fromEntries(Object.entries(p.extra ?? {}).filter(([, v]) => v)) }); for (const [k, v] of Object.entries(patch)) { if (v) u.set(k, v); else u.delete(k); } return `/agreements?${u.toString()}`; };
  const pageLink = (n: number) => qs({ page: String(n) });
  const sortLink = (key: string) => qs({ sort: key === "last_change" ? "" : key, dir: p.sort === key && p.dir !== "asc" ? "asc" : "", page: "" });
  const SortTh = ({ k, label, className }: { k: string; label: string; className?: string }) => <th className={"py-2.5 font-medium " + (className ?? "")}><Link href={sortLink(k)} className="hover:text-ink">{label}{(p.sort ?? "last_change") === k ? (p.dir === "asc" ? " ↑" : " ↓") : ""}</Link></th>;

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string } | { ok: true; data?: unknown }>) {
    const r = await fn();
    if (!r.ok) setNotice("error" in r ? r.error ?? "Something went wrong" : "Something went wrong");
    else { setNotice(label); setTimeout(() => setNotice(null), 3000); router.refresh(); }
  }

  return (
    <div className="rounded-lg bg-white border border-hairline">
      {selected.size > 0 ? (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-hairline bg-blush-1 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "move", ids: [...selected] })}>Move to folder</Button>
          {p.folder === "deleted"
            ? <Button size="sm" variant="secondary" onClick={() => run("Restored", () => bulkRestoreAction([...selected]).then((r) => { setSelected(new Set()); return r; }))}>Restore</Button>
            : <Button size="sm" variant="secondary" onClick={() => run("Deleted", () => bulkDeleteAction([...selected]).then((r) => { setSelected(new Set()); return r; }))}>Delete</Button>}
          <Button size="sm" variant="secondary" onClick={() => { for (const id of selected) { const r = p.rows.find((x) => x.id === id); if (r?.status === "completed") window.open(`/agreements/${id}?download=1`, "_blank"); } }}>Download</Button>
          <button className="ml-auto text-muted hover:text-ink" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      ) : null}
      {notice ? <div className="px-4 py-2 text-sm border-b border-hairline bg-paper">{notice}</div> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[12px] uppercase tracking-wide text-muted border-b border-hairline">
            <th className="w-10 px-3 sm:px-4 py-2.5 hidden sm:table-cell"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(p.rows.map((r) => r.id)))} /></th>
            <SortTh k="subject" label="Subject" className="pl-3 sm:pl-0" />
            <SortTh k="status" label="Status" className="w-[190px] hidden md:table-cell" />
            <SortTh k="last_change" label="Last change" className="w-[150px] hidden lg:table-cell" />
            <th className="py-2.5 w-[80px] sm:w-[230px]"></th>
          </tr>
        </thead>
        <tbody>
          {p.rows.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-16 text-center text-muted">{p.q ? `No agreements match "${p.q}".` : "Nothing here yet."}</td></tr>
          ) : p.rows.map((r) => {
            const when = fmtList(r.lastActivityAt, p.timezone);
            const to = r.recipients.filter((x) => x.role !== "cc").map((x) => x.name).filter(Boolean);
            const href = r.status === "draft" ? `/envelopes/${r.id}/prepare` : `/agreements/${r.id}`;
            return (
              <tr key={r.id} className="border-b border-hairline-2 last:border-0 hover:bg-paper/50 align-top">
                <td className="px-4 py-3 hidden sm:table-cell"><input type="checkbox" aria-label="Select" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="py-3 pl-3 sm:pl-0 pr-3 sm:pr-4 min-w-0">
                  <Link href={href} className="font-medium text-ink hover:underline line-clamp-1">{r.subject || "Untitled envelope"}</Link>
                  <div className="text-[12.5px] text-muted mt-0.5 line-clamp-1">
                    {r.ownerId !== p.userId ? <span>From: {r.ownerName} · </span> : null}
                    To: {to.length ? to.join(", ") : "No recipients yet"}
                  </div>
                  <div className="md:hidden mt-1.5 flex items-center gap-2 text-[12px]"><EnvelopeStatus status={r.status} myAction={r.myAction} /><span className="text-muted">· {when.date}</span></div>
                </td>
                <td className="py-3 pr-4 hidden md:table-cell"><EnvelopeStatus status={r.status} myAction={r.myAction} />{r.status === "sent" && r.expiresAt ? <div className="text-[11.5px] text-muted mt-0.5">Expires {fmtList(r.expiresAt, p.timezone).date}</div> : null}</td>
                <td className="py-3 pr-4 text-ink-2 hidden lg:table-cell"><div>{when.date}</div><div className="text-[12px] text-muted">{when.time}</div></td>
                <td className="py-2.5 pr-2 sm:pr-4">
                  <div className="flex items-center justify-end gap-1.5 [&>form>button]:hidden sm:[&>form>button]:inline-flex [&>a]:hidden sm:[&>a]:inline-flex [&>button]:hidden sm:[&>button]:inline-flex">
                    {r.deletedAt ? (
                      <Button size="sm" variant="secondary" onClick={() => run("Restored", () => restoreEnvelopeAction(r.id))}>Restore</Button>
                    ) : r.status === "draft" ? (
                      <LinkButton size="sm" variant="secondary" href={`/envelopes/${r.id}/prepare`}>Continue</LinkButton>
                    ) : r.status === "sent" && r.myAction ? (
                      <form action={signNowAction.bind(null, r.id)}><Button size="sm" type="submit">Sign</Button></form>
                    ) : r.status === "sent" ? (
                      <Button size="sm" variant="secondary" onClick={() => run("Resent", () => resendEnvelopeAction(r.id))}>Resend</Button>
                    ) : r.status === "completed" ? (
                      <LinkButton size="sm" variant="secondary" href={`/agreements/${r.id}?download=1`}><Download size={14} /> Download</LinkButton>
                    ) : (
                      <LinkButton size="sm" variant="secondary" href={href}>View</LinkButton>
                    )}
                    <Menu>
                      <MenuTrigger asChild><Button size="icon" variant="ghost" aria-label="More actions"><MoreHorizontal size={18} /></Button></MenuTrigger>
                      <MenuContent>
                        <MenuItem href={href}>Details</MenuItem>
                        {r.status === "completed" ? <MenuItem href={`/agreements/${r.id}?download=1`}>Download</MenuItem> : null}
                        {r.status === "sent" ? <MenuItem href={`/agreements/${r.id}?correct=1`}>Correct</MenuItem> : null}
                        {r.status === "sent" ? <MenuItem onSelect={() => setDialog({ kind: "void", ids: [r.id] })}>Void</MenuItem> : null}
                        <MenuItem onSelect={() => run("Copied to a new draft", () => cloneEnvelopeAction(r.id).then((x) => { if (x.ok && x.data) router.push(`/envelopes/${x.data.id}/prepare`); return x; }))}>Create a copy</MenuItem>
                        <MenuItem onSelect={() => setDialog({ kind: "template", ids: [r.id], name: r.subject })}>Save as template</MenuItem>
                        <MenuItem onSelect={() => setDialog({ kind: "move", ids: [r.id] })}>Move to folder</MenuItem>
                        <MenuItem href={`/agreements/${r.id}?history=1`}>History</MenuItem>
                        <MenuSeparator />
                        {r.deletedAt
                          ? <MenuItem onSelect={() => run("Restored", () => restoreEnvelopeAction(r.id))}>Restore</MenuItem>
                          : <MenuItem danger disabled={r.status === "sent"} onSelect={() => run("Deleted", () => deleteEnvelopeAction(r.id))}>Delete</MenuItem>}
                      </MenuContent>
                    </Menu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {p.total > 0 ? (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-hairline text-sm text-muted">
          <span>{(p.page - 1) * p.limit + 1}-{Math.min(p.total, p.page * p.limit)} of {p.total}</span>
          <div className="flex gap-1">
            <LinkButton size="sm" variant="secondary" href={pageLink(Math.max(1, p.page - 1))} aria-disabled={p.page <= 1}><ChevronLeft size={14} /></LinkButton>
            <LinkButton size="sm" variant="secondary" href={pageLink(Math.min(pages, p.page + 1))} aria-disabled={p.page >= pages}><ChevronRight size={14} /></LinkButton>
          </div>
        </div>
      ) : null}
      {dialog?.kind === "void" ? <VoidDialog id={dialog.ids[0]} open onOpenChange={(o) => !o && setDialog(null)} /> : null}
      {dialog?.kind === "template" ? <SaveAsTemplateDialog id={dialog.ids[0]} defaultName={dialog.name || ""} open onOpenChange={(o) => !o && setDialog(null)} /> : null}
      {dialog?.kind === "move" ? <MoveToFolderDialog ids={dialog.ids} folders={p.folders} open onOpenChange={(o) => !o && setDialog(null)} /> : null}
    </div>
  );
}
