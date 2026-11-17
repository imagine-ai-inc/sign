import { fmtDateTime } from "@/lib/format";

export function ActivityCard({ events, timezone }: { events: { id: number; description: string; createdAt: string; ip: string | null }[]; timezone: string }) {
  return (
    <section className="rounded-lg bg-white border border-hairline">
      <div className="px-5 py-3.5 border-b border-hairline-2"><h2 className="font-semibold">Activity</h2></div>
      <ol className="px-5 py-2">
        {events.map((e) => (
          <li key={e.id} className="flex gap-4 py-2.5 border-b border-hairline-2 last:border-0 text-[13px]">
            <div className="w-[190px] shrink-0 text-muted">{fmtDateTime(e.createdAt, timezone)}</div>
            <div className="flex-1 min-w-0 break-words [overflow-wrap:anywhere] text-ink-2">{e.description}{e.ip ? <span className="text-muted"> · {e.ip}</span> : null}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
