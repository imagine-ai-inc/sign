"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Download } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, MenuLabel } from "@/components/ui/menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea, NativeSelect } from "@/components/ui/input";
import { resendEnvelopeAction, deleteEnvelopeAction, restoreEnvelopeAction, cloneEnvelopeAction, correctEnvelopeAction, setCollaboratorsAction, transferOwnershipAction, setVisibilityAction } from "@/lib/actions/envelopes";
import { signNowAction, exportFormDataAction } from "@/lib/actions/manage";
import { VoidDialog, SaveAsTemplateDialog } from "@/components/agreements/dialogs";
import { fmtDateTime } from "@/lib/format";
import type { EnvelopeStatus, RecipientRole, RecipientStatus } from "@/lib/types";

type Props = {
  envelope: { id: string; subject: string; message: string; status: EnvelopeStatus; visibility: "workspace" | "private"; expireAfterDays: number; reminderEnabled: boolean; completedFileId: string | null; certificateFileId: string | null; ownerId: string; deletedAt: string | null };
  recipients: { id: string; name: string; email: string; role: RecipientRole; status: RecipientStatus }[];
  documents: { id: string; name: string; fileId: string }[];
  events: { id: number; type: string; description: string; ip: string | null; hash: string; createdAt: string }[];
  users: { id: string; name: string; email: string }[];
  collaborators: { userId: string; permission: "view" | "edit" | "manage" }[];
  canEdit: boolean; isAdmin: boolean; isOwner: boolean; mineToSign: boolean; timezone: string;
  openHistory?: boolean; openCorrect?: boolean; autoDownload?: boolean;
};

export function DetailsActions(p: Props) {
  const router = useRouter();
  const e = p.envelope;
  const [dlg, setDlg] = useState<null | "void" | "template" | "correct" | "share" | "transfer" | "history">(p.openHistory ? "history" : p.openCorrect ? "correct" : null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { if (p.autoDownload && e.completedFileId) window.location.href = `/api/files/${e.completedFileId}?download=1`; }, [p.autoDownload, e.completedFileId]);
  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    const r = await fn();
    setNotice(r.ok ? label : ("error" in r && r.error) || "Something went wrong");
    setTimeout(() => setNotice(null), 3000);
    if (r.ok) router.refresh();
  }
  const sent = e.status === "sent";
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {p.mineToSign ? <form action={signNowAction.bind(null, e.id)}><Button type="submit">Sign</Button></form> : null}
        {sent && p.canEdit ? <Button variant="secondary" onClick={() => setDlg("correct")}>Correct</Button> : null}
        {sent && p.canEdit ? <Button variant="secondary" onClick={() => run("Resent to everyone waiting", () => resendEnvelopeAction(e.id))}>Resend</Button> : null}
        {e.status === "completed" && e.completedFileId ? <LinkButton variant="secondary" href={`/api/files/${e.completedFileId}?download=1`}><Download size={15} /> Download</LinkButton> : null}
        <Menu>
          <MenuTrigger asChild><Button variant="secondary">More <ChevronDown size={15} /></Button></MenuTrigger>
          <MenuContent>
            {sent && p.canEdit ? <MenuItem onSelect={() => setDlg("void")}>Void</MenuItem> : null}
            <MenuItem onSelect={() => run("Copied", () => cloneEnvelopeAction(e.id).then((x) => { if (x.ok && x.data) router.push(`/envelopes/${x.data.id}/prepare`); return x; }))}>Create a copy</MenuItem>
            <MenuItem onSelect={() => setDlg("template")}>Save as template</MenuItem>
            {p.canEdit ? <MenuItem onSelect={() => setDlg("share")}>Share and visibility</MenuItem> : null}
            {p.isOwner || p.isAdmin ? <MenuItem onSelect={() => setDlg("transfer")}>Transfer ownership</MenuItem> : null}
            <MenuSeparator />
            <MenuLabel>Download</MenuLabel>
            {e.status === "completed" && e.completedFileId ? <MenuItem href={`/api/files/${e.completedFileId}?download=1`}>Completed document</MenuItem> : null}
            {e.status === "completed" && e.certificateFileId ? <MenuItem href={`/api/files/${e.certificateFileId}?download=1`}>Certificate of completion</MenuItem> : null}
            {p.documents.map((d) => <MenuItem key={d.id} href={`/api/files/${d.fileId}?download=1`}>{d.name}.pdf{e.status === "completed" ? " (original)" : ""}</MenuItem>)}
            <MenuSeparator />
            <MenuItem onSelect={async () => { const r = await exportFormDataAction(e.id); if (r.ok && r.data) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.data.csv], { type: "text/csv" })); a.download = r.data.filename; a.click(); } }}>Export form data (CSV)</MenuItem>
            <MenuItem onSelect={() => setDlg("history")}>History</MenuItem>
            {e.deletedAt
              ? <MenuItem onSelect={() => run("Restored", () => restoreEnvelopeAction(e.id))}>Restore</MenuItem>
              : <MenuItem danger disabled={sent} onSelect={() => run("Deleted", () => deleteEnvelopeAction(e.id).then((x) => { if (x.ok) router.push("/agreements"); return x; }))}>Delete</MenuItem>}
          </MenuContent>
        </Menu>
      </div>
      {notice ? <div className="text-[12.5px] text-ink-2 bg-paper px-2.5 py-1 rounded">{notice}</div> : null}
      {dlg === "void" ? <VoidDialog id={e.id} open onOpenChange={(o) => !o && setDlg(null)} /> : null}
      {dlg === "template" ? <SaveAsTemplateDialog id={e.id} defaultName={e.subject} open onOpenChange={(o) => !o && setDlg(null)} /> : null}
      {dlg === "correct" ? <CorrectDialog p={p} onClose={() => setDlg(null)} /> : null}
      {dlg === "share" ? <ShareDialog p={p} onClose={() => setDlg(null)} /> : null}
      {dlg === "transfer" ? <TransferDialog p={p} onClose={() => setDlg(null)} /> : null}
      {dlg === "history" ? <HistoryDialog p={p} onClose={() => setDlg(null)} /> : null}
    </div>
  );
}

function CorrectDialog({ p, onClose }: { p: Props; onClose: () => void }) {
  const router = useRouter();
  const pending = p.recipients.filter((r) => r.status === "sent" || r.status === "delivered" || r.status === "created");
  const [recs, setRecs] = useState(pending.map((r) => ({ id: r.id, name: r.name, email: r.email })));
  const [subject, setSubject] = useState(p.envelope.subject);
  const [message, setMessage] = useState(p.envelope.message);
  const [days, setDays] = useState(p.envelope.expireAfterDays);
  const [reminders, setReminders] = useState(p.envelope.reminderEnabled);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Correct envelope" description="Change recipients who haven't finished, the message, or the expiration. Changed recipients get a new email." wide>
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await correctEnvelopeAction(p.envelope.id, { subject, message, expireAfterDays: days, reminderEnabled: reminders, recipients: recs }); setBusy(false); if (!r.ok) return setErr(r.error); onClose(); router.refresh(); }}>
          <div>
            <Label>Recipients still pending</Label>
            <div className="mt-1.5 space-y-2">
              {recs.length === 0 ? <p className="text-sm text-muted">Everyone has already acted.</p> : recs.map((r, i) => (
                <div key={r.id} className="grid grid-cols-2 gap-2">
                  <Input value={r.name} placeholder="Name" onChange={(e) => setRecs(recs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input value={r.email} placeholder="Email" type="email" onChange={(e) => setRecs(recs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="c-subj">Email subject</Label><Input id="c-subj" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-msg">Email message</Label><Textarea id="c-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
          <div className="flex items-center gap-6">
            <div className="space-y-1.5"><Label htmlFor="c-days">Expires (days after sending)</Label><Input id="c-days" type="number" min={1} max={999} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-28" /></div>
            <label className="flex items-center gap-2 text-sm mt-5"><input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} /> Send reminders</label>
          </div>
          {err ? <p className="text-sm text-bad">{err}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>Save and resend</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({ p, onClose }: { p: Props; onClose: () => void }) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(p.envelope.visibility);
  const [list, setList] = useState(p.collaborators);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const others = p.users.filter((u) => u.id !== p.envelope.ownerId);
  const perm = (uid: string) => list.find((c) => c.userId === uid)?.permission ?? "";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Share and visibility" description="Team envelopes are visible to everyone in the workspace. Private envelopes are only visible to the owner, admins and the people below.">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const a = await setVisibilityAction(p.envelope.id, visibility); const b = await setCollaboratorsAction(p.envelope.id, list); setBusy(false); if (!a.ok) return setErr(a.error); if (!b.ok) return setErr(b.error); onClose(); router.refresh(); }}>
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={visibility === "workspace"} onChange={() => setVisibility("workspace")} /> Team</label>
              <label className="flex items-center gap-2"><input type="radio" checked={visibility === "private"} onChange={() => setVisibility("private")} /> Private</label>
            </div>
          </div>
          <div>
            <Label>People with access</Label>
            <div className="mt-1.5 divide-y divide-hairline-2 border border-hairline rounded-md">
              {others.length === 0 ? <p className="p-3 text-sm text-muted">No other users yet.</p> : others.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{u.name || u.email}</div><div className="text-xs text-muted truncate">{u.email}</div></div>
                  <NativeSelect value={perm(u.id)} className="h-8 text-[12.5px]" onChange={(e) => { const v = e.target.value as "" | "view" | "edit" | "manage"; setList((l) => { const rest = l.filter((c) => c.userId !== u.id); return v ? [...rest, { userId: u.id, permission: v }] : rest; }); }}>
                    <option value="">No access</option><option value="view">Can view</option><option value="edit">Can edit</option><option value="manage">Can manage</option>
                  </NativeSelect>
                </div>
              ))}
            </div>
          </div>
          {err ? <p className="text-sm text-bad">{err}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ p, onClose }: { p: Props; onClose: () => void }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Transfer ownership" description="The new owner gets sender notifications and shows as the sender on the details page.">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await transferOwnershipAction(p.envelope.id, to); setBusy(false); if (!r.ok) return setErr(r.error); onClose(); router.refresh(); }}>
          <NativeSelect className="w-full" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose a teammate</option>
            {p.users.filter((u) => u.id !== p.envelope.ownerId).map((u) => <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>)}
          </NativeSelect>
          {err ? <p className="text-sm text-bad">{err}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !to}>Transfer</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ACTIONS: Record<string, string> = { "envelope.created": "Created", "envelope.sent": "Sent", "recipient.sent": "Sent", "recipient.viewed": "Viewed", "recipient.consented": "Consented", "recipient.signature_adopted": "Adopted signature", "recipient.signed": "Signed", "recipient.approved": "Approved", "recipient.acknowledged": "Viewed", "recipient.declined": "Declined", "recipient.reassigned": "Reassigned", "recipient.copy_sent": "Copy sent", "envelope.completed": "Completed", "envelope.voided": "Voided", "envelope.expired": "Expired", "envelope.corrected": "Corrected", "envelope.resent": "Resent", "reminder.sent": "Reminder", "comment.added": "Comment", "document.downloaded": "Downloaded", "envelope.transferred": "Transferred", "envelope.from_template": "Created" };

function HistoryDialog({ p, onClose }: { p: Props; onClose: () => void }) {
  const e = p.envelope;
  const userOf = (ev: Props["events"][number]) => {
    const m = /(?:by|Sent to|Viewed by|Signed by|Approved by|Declined by|Copy sent to)\s+([^(:,]+?)(?:\s*\(([^)]+)\))?(?::|,|$)/.exec(ev.description);
    return m ? { name: m[1].trim(), email: m[2] || "" } : { name: "", email: "" };
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Envelope History" description={`Envelope ID: ${e.id.toUpperCase()}`} wide>
        <div className="flex items-center justify-between mb-3 text-sm">
          <span className="text-muted">Every event is hash chained to the one before it.</span>
          {e.certificateFileId ? <a href={`/api/files/${e.certificateFileId}?download=1`} className="text-rose-ink hover:underline">Download certificate</a> : null}
        </div>
        <div className="max-h-[60vh] overflow-y-auto border border-hairline rounded-md">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-paper text-left text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-2 font-medium">Time</th><th className="px-3 py-2 font-medium">User</th><th className="px-3 py-2 font-medium">Action</th><th className="px-3 py-2 font-medium">Activity</th></tr></thead>
            <tbody>
              {p.events.map((ev) => { const u = userOf(ev); return (
                <tr key={ev.id} className="border-t border-hairline-2 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-muted">{fmtDateTime(ev.createdAt, p.timezone)}</td>
                  <td className="px-3 py-2">{u.name}<div className="text-[11px] text-muted">{u.email || ev.ip || ""}</div></td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium">{ACTIONS[ev.type] || ev.type}</td>
                  <td className="px-3 py-2">{ev.description}<div className="font-mono text-[10.5px] text-muted">{ev.hash.slice(0, 12)}</div></td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
