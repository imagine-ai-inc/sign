import Link from "next/link";
import { Inbox, Send, FileEdit, Trash2, PenLine, Clock, Hourglass, CheckCircle2, XCircle, Ban, Folder } from "lucide-react";
import { startEnvelope } from "@/lib/actions/envelopes";
import { NewFolderButton } from "@/components/agreements/new-folder";
import { cn } from "@/lib/cn";

type Counts = { actionRequired: number; waiting: number; expiring: number; completed: number; drafts: number };

export function AgreementsSidebar({ active, counts, folders }: { active: string; counts: Counts; folders: { id: string; name: string; count: number }[] }) {
  const item = (key: string, label: string, Icon: React.ComponentType<{ size?: number; className?: string }>, count?: number) => (
    <Link key={key} href={`/agreements?folder=${key}`} className={cn("flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13.5px] text-ink-2 hover:bg-paper-2", active === key && "bg-blush-1 text-ink font-medium")}>
      <Icon size={16} className={active === key ? "text-rose-ink" : "text-muted"} />
      <span className="flex-1 truncate">{label}</span>
      {typeof count === "number" && count > 0 ? <span className="text-[11px] text-muted tabular-nums">{count}</span> : null}
    </Link>
  );
  return (
    <aside className="w-[248px] shrink-0 border-r border-hairline bg-white px-3 py-5 hidden md:block">
      <form action={startEnvelope} className="px-1 mb-5">
        <button type="submit" className="w-full h-10 rounded-[6px] bg-ink text-white text-sm font-medium hover:bg-[#2a2827] focus-ring">Start</button>
      </form>
      <Section title="Envelopes">
        {item("inbox", "Inbox", Inbox)}
        {item("sent", "Sent", Send)}
        {item("drafts", "Drafts", FileEdit, counts.drafts)}
        {item("deleted", "Deleted", Trash2)}
      </Section>
      <Section title="Quick Views">
        {item("action_required", "Action Required", PenLine, counts.actionRequired)}
        {item("waiting", "Waiting for Others", Clock, counts.waiting)}
        {item("expiring", "Expiring Soon", Hourglass, counts.expiring)}
        {item("completed", "Completed", CheckCircle2, counts.completed)}
        {item("declined", "Declined", XCircle)}
        {item("voided", "Voided", Ban)}
      </Section>
      <Section title="Folders" action={<NewFolderButton />}>
        {folders.length === 0 ? <p className="px-3 py-1 text-xs text-muted">No folders yet</p> : folders.map((f) => item(f.id, f.name, Folder, f.count))}
      </Section>
    </aside>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between px-3 mb-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</div>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
