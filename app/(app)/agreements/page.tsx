import { requireUser } from "@/lib/auth";
import { listEnvelopes, folderCounts, listFolders } from "@/lib/services/envelopes";
import { listUsers } from "@/lib/services/users";
import { AgreementsSidebar } from "@/components/agreements/sidebar";
import { AgreementsTable } from "@/components/agreements/table";
import { AgreementsToolbar, type Filters } from "@/components/agreements/toolbar";

export const metadata = { title: "Agreements" };

const TITLES: Record<string, string> = {
  all: "All agreements", inbox: "Inbox", sent: "Sent", drafts: "Drafts", deleted: "Deleted",
  action_required: "Action Required", waiting: "Waiting for Others", expiring: "Expiring Soon",
  completed: "Completed", declined: "Declined", voided: "Voided",
};
const RANGE_MS: Record<string, number> = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5, "6mo": 182 * 864e5, "12mo": 365 * 864e5 };

export default async function AgreementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const folder = sp.folder || "all";
  const scope = sp.scope === "mine" ? "mine" : "team";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const limit = 50;
  const filters: Filters = { q: sp.q || "", range: sp.range || "all", status: (sp.status || "").split(",").filter(Boolean), from: sp.from || "", sort: sp.sort || "last_change", dir: sp.dir === "asc" ? "asc" : "desc" };
  const filtering = filters.range !== "all" || filters.status.length > 0 || !!filters.from || filters.sort !== "last_change";
  const [data, counts, folders, users] = await Promise.all([
    listEnvelopes(user, { folder, q: sp.q, scope, limit: filtering ? 200 : limit, offset: filtering ? 0 : (page - 1) * limit }),
    folderCounts(user),
    listFolders(user),
    listUsers(user),
  ]);
  let rows = data.rows;
  let total = data.total;
  if (filtering) {
    const since = RANGE_MS[filters.range] ? Date.now() - RANGE_MS[filters.range] : 0;
    rows = rows.filter((r) => {
      if (since && new Date(r.lastActivityAt).getTime() < since) return false;
      if (filters.from && r.ownerId !== filters.from) return false;
      if (filters.status.length) {
        const key = r.status === "sent" ? (r.myAction ? "need_to_sign" : "waiting") : r.status;
        if (!filters.status.includes(key)) return false;
      }
      return true;
    });
    const dir = filters.dir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (filters.sort === "subject") return a.subject.localeCompare(b.subject) * dir;
      if (filters.sort === "status") return a.status.localeCompare(b.status) * dir;
      return (new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime()) * dir;
    });
    total = rows.length;
    rows = rows.slice((page - 1) * limit, page * limit);
  }
  const custom = folders.find((f) => f.id === folder);
  const title = custom ? custom.name : TITLES[folder] || "All agreements";
  const serial = rows.map((r) => ({ ...r, sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null, completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null, expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null, lastActivityAt: new Date(r.lastActivityAt).toISOString(), createdAt: new Date(r.createdAt).toISOString(), deletedAt: r.deletedAt ? new Date(r.deletedAt).toISOString() : null }));
  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <AgreementsSidebar active={folder} counts={counts} folders={folders} />
      <main className="flex-1 min-w-0 px-3 sm:px-8 py-4 sm:py-6">
        <div className="md:hidden -mx-3 px-3 mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {[["inbox","Inbox"],["sent","Sent"],["drafts","Drafts"],["action_required","Action required"],["waiting","Waiting"],["completed","Completed"],["expiring","Expiring"],["deleted","Deleted"]].map(([k, l]) => (
            <a key={k} href={`/agreements?folder=${k}`} className={`shrink-0 h-8 px-3 rounded-full border text-[13px] inline-flex items-center ${folder === k ? "bg-ink text-white border-ink" : "bg-white border-hairline text-ink-2"}`}>{l}</a>
          ))}
          <a href="/agreements/start" className="hidden" aria-hidden="true" />
        </div>
        <AgreementsToolbar title={title} scope={scope} folder={folder} total={total} filters={filters} users={users.filter((u) => !u.email.endsWith("@resend.dev")).map((u) => ({ id: u.id, name: u.name || u.email }))} rows={serial} />
        <AgreementsTable rows={serial} folders={folders.map((f) => ({ id: f.id, name: f.name }))} timezone={user.timezone} userId={user.id} folder={folder} total={total} page={page} limit={limit} q={filters.q} scope={scope} sort={filters.sort} dir={filters.dir} extra={{ range: filters.range, status: filters.status.join(","), from: filters.from }} />
      </main>
    </div>
  );
}
