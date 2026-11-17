import { CheckCircle2, Clock, Ban, XCircle, Hourglass, Link2Off, UserRoundX } from "lucide-react";
import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui/button";

export function StatusCard({ icon, title, children, actions }: { icon: ReactNode; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-10">
      <div className="w-full max-w-[560px] bg-white border border-hairline rounded-xl p-8 sm:p-10 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-blush-1 flex items-center justify-center">{icon}</div>
        <h1 className="font-serif text-[30px] leading-tight mt-5">{title}</h1>
        <div className="text-[15px] text-ink-2 mt-3 space-y-2">{children}</div>
        {actions ? <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
      </div>
    </main>
  );
}

export function InvalidLink() {
  return (
    <StatusCard icon={<Link2Off size={28} className="text-rose-ink" />} title="This link isn't valid anymore">
      <p>It may have been replaced by a newer email, or the envelope was changed by the sender.</p>
      <p>Open the most recent email you received, or ask the sender to resend the document.</p>
    </StatusCard>
  );
}

export function WaitingScreen({ earlier, subject }: { earlier: string[]; subject: string }) {
  return (
    <StatusCard icon={<Clock size={28} className="text-rose-ink" />} title="It isn't your turn yet">
      <p className="font-medium text-ink">{subject}</p>
      <p>This envelope will be ready for you after {earlier.length ? earlier.join(", ") : "the earlier recipients"} {earlier.length === 1 ? "finishes" : "finish"}. We&apos;ll email you when it&apos;s your turn.</p>
    </StatusCard>
  );
}

export function DoneScreen({ subject, token, completed, hasCertificate }: { subject: string; token: string; completed: boolean; hasCertificate: boolean }) {
  return (
    <StatusCard
      icon={<CheckCircle2 size={30} className="text-ok" />}
      title={completed ? "All done" : "You're done signing"}
      actions={completed ? (
        <>
          <LinkButton href={`/api/s/${token}/completed?download=1`}>Download document</LinkButton>
          {hasCertificate ? <LinkButton href={`/api/s/${token}/certificate?download=1`} variant="secondary">Certificate of completion</LinkButton> : null}
        </>
      ) : null}
    >
      <p className="font-medium text-ink">{subject}</p>
      {completed ? <p>Everyone has finished. The completed document was also emailed to you.</p> : <p>Thanks. A copy will be emailed to you once everyone has signed.</p>}
    </StatusCard>
  );
}

export function CompletedScreen({ subject, token, hasCompletedFile, hasCertificate }: { subject: string; token: string; hasCompletedFile: boolean; hasCertificate: boolean }) {
  return (
    <StatusCard
      icon={<CheckCircle2 size={30} className="text-ok" />}
      title="This envelope is complete"
      actions={hasCompletedFile ? (
        <>
          <LinkButton href={`/api/s/${token}/completed?download=1`}>Download document</LinkButton>
          <LinkButton href={`/api/s/${token}/completed`} variant="secondary" target="_blank" rel="noreferrer">View</LinkButton>
          {hasCertificate ? <LinkButton href={`/api/s/${token}/certificate?download=1`} variant="secondary">Certificate of completion</LinkButton> : null}
        </>
      ) : null}
    >
      <p className="font-medium text-ink">{subject}</p>
      <p>{hasCompletedFile ? "All parties have signed. You can download your copy below." : "All parties have signed. The final document is being prepared and will be emailed to you shortly."}</p>
    </StatusCard>
  );
}

export function VoidedScreen({ subject, reason, sender }: { subject: string; reason: string | null; sender: { name: string; email: string } }) {
  return (
    <StatusCard icon={<Ban size={28} className="text-muted" />} title="This envelope was voided">
      <p className="font-medium text-ink">{subject}</p>
      {reason ? <p>Reason from {sender.name}: &ldquo;{reason}&rdquo;</p> : null}
      <p>If you think this is a mistake, contact <a className="text-rose-ink underline" href={`mailto:${sender.email}`}>{sender.email}</a>.</p>
    </StatusCard>
  );
}

export function DeclinedScreen({ subject, sender }: { subject: string; sender: { name: string; email: string } }) {
  return (
    <StatusCard icon={<XCircle size={28} className="text-bad" />} title="This envelope was declined">
      <p className="font-medium text-ink">{subject}</p>
      <p>A recipient declined to sign, so the envelope is closed. Questions? Contact <a className="text-rose-ink underline" href={`mailto:${sender.email}`}>{sender.name}</a>.</p>
    </StatusCard>
  );
}

export function ExpiredScreen({ subject, sender }: { subject: string; sender: { name: string; email: string } }) {
  return (
    <StatusCard icon={<Hourglass size={28} className="text-warn" />} title="This envelope has expired">
      <p className="font-medium text-ink">{subject}</p>
      <p>The signing window closed. Ask <a className="text-rose-ink underline" href={`mailto:${sender.email}`}>{sender.name}</a> to send a new one.</p>
    </StatusCard>
  );
}

export function ReplacedScreen({ subject }: { subject: string }) {
  return (
    <StatusCard icon={<UserRoundX size={28} className="text-muted" />} title="This envelope was reassigned">
      <p className="font-medium text-ink">{subject}</p>
      <p>It was assigned to someone else, so nothing more is needed from you.</p>
    </StatusCard>
  );
}
