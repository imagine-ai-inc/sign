import { CheckCircle2, Clock, PenLine, XCircle, Ban, FileEdit, Hourglass, Eye, Mail } from "lucide-react";
import type { EnvelopeStatus, RecipientStatus, RecipientRole } from "@/lib/types";

export function envelopeStatusLabel(status: EnvelopeStatus, myAction?: boolean) {
  if (status === "sent") return myAction ? "Need to sign" : "Waiting for others";
  return { draft: "Draft", completed: "Completed", declined: "Declined", voided: "Voided", expired: "Expired", template: "Template", sent: "Sent" }[status];
}

export function EnvelopeStatusIcon({ status, myAction, size = 16 }: { status: EnvelopeStatus; myAction?: boolean; size?: number }) {
  switch (status) {
    case "completed": return <CheckCircle2 size={size} className="text-ok" />;
    case "sent": return myAction ? <PenLine size={size} className="text-rose-ink" /> : <Clock size={size} className="text-muted" />;
    case "declined": return <XCircle size={size} className="text-bad" />;
    case "voided": return <Ban size={size} className="text-muted" />;
    case "expired": return <Hourglass size={size} className="text-warn" />;
    default: return <FileEdit size={size} className="text-muted" />;
  }
}

export function EnvelopeStatus({ status, myAction }: { status: EnvelopeStatus; myAction?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <EnvelopeStatusIcon status={status} myAction={myAction} />
      <span className={status === "sent" && myAction ? "font-medium text-ink" : "text-ink-2"}>{envelopeStatusLabel(status, myAction)}</span>
    </span>
  );
}

export function roleLabel(role: RecipientRole) {
  return { signer: "Needs to Sign", cc: "Receives a Copy", viewer: "Needs to View", approver: "Needs to Approve" }[role];
}

export function RecipientStatusLine({ status, role }: { status: RecipientStatus; role: RecipientRole }) {
  const map: Record<RecipientStatus, { label: string; icon: React.ReactNode }> = {
    created: { label: role === "cc" ? "Will receive a copy" : "Waiting in routing order", icon: <Hourglass size={14} className="text-muted" /> },
    sent: { label: "Sent", icon: <Mail size={14} className="text-muted" /> },
    delivered: { label: "Viewed", icon: <Eye size={14} className="text-muted" /> },
    completed: { label: role === "signer" ? "Signed" : role === "approver" ? "Approved" : role === "viewer" ? "Viewed" : "Copy sent", icon: <CheckCircle2 size={14} className="text-ok" /> },
    declined: { label: "Declined", icon: <XCircle size={14} className="text-bad" /> },
    replaced: { label: "Reassigned", icon: <Ban size={14} className="text-muted" /> },
  };
  const m = map[status];
  return <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">{m.icon}{m.label}</span>;
}
