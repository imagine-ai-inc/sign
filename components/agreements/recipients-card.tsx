import { RecipientStatusLine, roleLabel } from "@/components/status";
import { recipientColor } from "@/lib/colors";
import { fmtDateTime, initialsOf } from "@/lib/format";
import type { RecipientRole, RecipientStatus } from "@/lib/types";

interface R { id: string; name: string; email: string; role: RecipientRole; status: RecipientStatus; routingOrder: number; colorIndex: number; sentAt: string | null; deliveredAt: string | null; completedAt: string | null; declinedAt: string | null; declineReason: string | null; replacedBy: string | null }

export function RecipientsCard({ recipients, signingOrder, timezone }: { recipients: R[]; signingOrder: boolean; timezone: string }) {
  const byId = new Map(recipients.map((r) => [r.id, r]));
  return (
    <section className="rounded-lg bg-white border border-hairline">
      <div className="px-5 py-3.5 border-b border-hairline-2 flex items-center justify-between">
        <h2 className="font-semibold">Recipients</h2>
        <span className="text-xs text-muted">{signingOrder ? "Signing order set" : "All recipients at once"}</span>
      </div>
      <ul>
        {recipients.map((r) => {
          const c = recipientColor(r.colorIndex);
          const replacedTo = r.replacedBy ? byId.get(r.replacedBy) : null;
          return (
            <li key={r.id} className="flex items-start gap-4 px-5 py-3.5 border-b border-hairline-2 last:border-0">
              <div className="w-6 text-center text-[12px] text-muted pt-2.5 tabular-nums">{signingOrder && r.role !== "cc" ? r.routingOrder : ""}</div>
              <div className="h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0" style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>{initialsOf(r.name || r.email)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{r.name || <span className="text-muted">Unnamed</span>} <span className="font-normal text-muted">· {roleLabel(r.role)}</span></div>
                <div className="text-[12.5px] text-muted">{r.email}</div>
                {r.declineReason ? <div className="mt-1 text-[12.5px] text-bad">Declined: {r.declineReason}</div> : null}
                {replacedTo ? <div className="mt-1 text-[12.5px] text-muted">Reassigned to {replacedTo.name} ({replacedTo.email})</div> : null}
              </div>
              <div className="text-right shrink-0">
                <RecipientStatusLine status={r.status} role={r.role} />
                <div className="text-[11.5px] text-muted mt-1 space-y-0.5">
                  {r.sentAt ? <div>Sent {fmtDateTime(r.sentAt, timezone)}</div> : null}
                  {r.deliveredAt ? <div>Viewed {fmtDateTime(r.deliveredAt, timezone)}</div> : null}
                  {r.completedAt ? <div>{r.role === "signer" ? "Signed" : r.role === "approver" ? "Approved" : "Done"} {fmtDateTime(r.completedAt, timezone)}</div> : null}
                  {r.declinedAt ? <div>Declined {fmtDateTime(r.declinedAt, timezone)}</div> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
