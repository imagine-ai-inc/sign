"use client";
import { brand, serviceLine } from "@/lib/brand";
import { useEffect, useState, useTransition } from "react";
import { ChevronDown, Clock, XCircle, UserRoundPlus, Printer, LifeBuoy, Info, History, Award, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { declineAction, historyAction, reassignAction } from "@/lib/actions/signer";
import type { SignerHistoryRow } from "@/lib/services/signing-extra";

export type OtherOutcome = "declined" | "reassigned" | "later";
export type SignerDialog = "decline" | "reassign" | "about" | "history" | "session" | null;

export interface OtherActionsProps {
  token: string;
  allowReassign: boolean;
  sender: { name: string; email: string };
  envelopeId: string;
  recipientEmail: string;
  completed?: boolean;
  onOutcome: (o: OtherOutcome) => void;
  disabled?: boolean;
  /** Controlled dialog (so the page can open Decline / About from elsewhere). */
  dialog?: SignerDialog;
  onDialogChange?: (d: SignerDialog) => void;
}

export function OtherActions(p: OtherActionsProps) {
  const [local, setLocal] = useState<SignerDialog>(null);
  const dialog = p.dialog !== undefined ? p.dialog : local;
  const setDialog = (d: SignerDialog) => { setLocal(d); p.onDialogChange?.(d); };
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary" disabled={p.disabled} className="uppercase tracking-wide text-[12px] font-semibold">Other actions <ChevronDown size={14} /></Button>
        </MenuTrigger>
        <MenuContent align="end" className="min-w-[250px]">
          <MenuItem onSelect={() => p.onOutcome("later")}><Clock size={15} /> Finish Later</MenuItem>
          <MenuItem disabled><Printer size={15} /> Print &amp; Sign <span className="ml-auto text-[11px] text-muted">Coming soon</span></MenuItem>
          {p.allowReassign ? <MenuItem onSelect={() => setDialog("reassign")}><UserRoundPlus size={15} /> Assign to Someone Else</MenuItem> : null}
          <MenuItem onSelect={() => setDialog("decline")} danger><XCircle size={15} /> Decline to Sign</MenuItem>
          <MenuSeparator />
          <MenuItem href={`mailto:${p.sender.email}?subject=${encodeURIComponent("Question about the document you sent")}`}><LifeBuoy size={15} /> Help &amp; Support</MenuItem>
          <MenuItem onSelect={() => setDialog("about")}><Info size={15} /> About {brand.name}</MenuItem>
          <MenuItem onSelect={() => setDialog("history")}><History size={15} /> View History</MenuItem>
          {p.completed ? <MenuItem href={`/api/s/${p.token}/certificate`}><Award size={15} /> View Certificate</MenuItem> : null}
          <MenuItem onSelect={() => setDialog("session")}><MonitorSmartphone size={15} /> Session Information</MenuItem>
        </MenuContent>
      </Menu>
      <SignerDialogs {...p} dialog={dialog} setDialog={setDialog} />
    </>
  );
}

export function SignerDialogs(p: OtherActionsProps & { dialog: SignerDialog; setDialog: (d: SignerDialog) => void }) {
  const { token, dialog, setDialog } = p;
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [history, setHistory] = useState<SignerHistoryRow[] | null>(null);
  const [now, setNow] = useState("");

  function close() { setDialog(null); setError(null); setReason(""); setName(""); setEmail(""); }

  useEffect(() => {
    if (dialog === "history" && history === null) historyAction(token).then((r) => setHistory(r.ok ? r.data ?? [] : []));
    if (dialog === "session") setNow(new Date().toLocaleString());
  }, [dialog, history, token]);

  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser = /Edg\//.test(ua) ? "Microsoft Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";

  return (
    <>
      <Dialog open={dialog === "decline"} onOpenChange={(o) => !o && close()}>
        <DialogContent title="Decline to Sign" description="The sender and other recipients will be notified. This can't be undone.">
          <div className="space-y-1.5">
            <Label htmlFor="decline-reason">Reason for declining</Label>
            <Textarea id="decline-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell the sender why you're declining" />
          </div>
          {error ? <p className="text-sm text-bad mt-3">{error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
            <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => start(async () => {
              const r = await declineAction(token, reason);
              if (!r.ok) setError(r.error); else { close(); p.onOutcome("declined"); }
            })}>{pending ? "Declining..." : "Decline to Sign"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "reassign"} onOpenChange={(o) => !o && close()}>
        <DialogContent title="Assign to Someone Else" description="The new signer gets their own email with the document. The sender is notified.">
          <div className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="ra-name">New signer&apos;s name</Label><Input id="ra-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ra-email">New signer&apos;s email</Label><Input id="ra-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ra-reason">Reason (optional)</Label><Textarea id="ra-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          {error ? <p className="text-sm text-bad mt-3">{error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
            <Button disabled={pending || !name.trim() || !email.trim()} onClick={() => start(async () => {
              const r = await reassignAction(token, { name, email, reason });
              if (!r.ok) setError(r.error); else { close(); p.onOutcome("reassigned"); }
            })}>{pending ? "Assigning..." : "Assign"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "about"} onOpenChange={(o) => !o && close()}>
        <DialogContent title={`About ${brand.name}`}>
          <div className="text-sm text-ink-2 space-y-3">
            <p>{serviceLine()}. Documents signed here are sealed, hash-chained in an audit trail, and delivered with a Certificate of Completion.</p>
            <p className="font-mono text-[12px] text-muted">Envelope ID {p.envelopeId}</p>
            <p className="text-[12px] text-muted">Electronic signatures made through {brand.name} are intended to be legally binding under the U.S. ESIGN Act and UETA. Questions? Email {p.sender.email}.</p>
          </div>
          <div className="mt-5 flex justify-end"><Button onClick={close}>Close</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "history"} onOpenChange={(o) => !o && close()}>
        <DialogContent title="History" description={`Envelope ID ${p.envelopeId}`} wide>
          {history === null ? <p className="text-sm text-muted py-6 text-center">Loading...</p> : (
            <div className="max-h-[60vh] overflow-y-auto border border-hairline rounded-md">
              <table className="w-full text-[13px]">
                <thead className="bg-paper text-left text-[11px] uppercase tracking-wide text-muted sticky top-0"><tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Activity</th></tr></thead>
                <tbody>
                  {history.map((h, i) => <tr key={i} className="border-t border-hairline-2 align-top"><td className="px-3 py-2 whitespace-nowrap text-muted">{fmt(h.at)}</td><td className="px-3 py-2 whitespace-nowrap">{h.user}</td><td className="px-3 py-2 whitespace-nowrap">{h.action}</td><td className="px-3 py-2 text-ink-2">{h.activity}</td></tr>)}
                  {!history.length ? <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">No activity yet</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 flex justify-end"><Button onClick={close}>Close</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "session"} onOpenChange={(o) => !o && close()}>
        <DialogContent title="Session Information">
          <dl className="text-sm grid grid-cols-[150px_1fr] gap-y-2">
            <dt className="text-muted">Envelope ID</dt><dd className="font-mono text-[12px] break-all">{p.envelopeId}</dd>
            <dt className="text-muted">Recipient</dt><dd className="break-all">{p.recipientEmail}</dd>
            <dt className="text-muted">IP address</dt><dd>Recorded with each action</dd>
            <dt className="text-muted">Browser</dt><dd>{browser}</dd>
            <dt className="text-muted">Time</dt><dd>{now}</dd>
          </dl>
          <div className="mt-5 flex justify-end"><Button onClick={close}>Close</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
