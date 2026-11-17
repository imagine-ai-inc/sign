import Link from "next/link";
import { Search, Star, LayoutTemplate, Users, Trash2, FolderOpen } from "lucide-react";
import { requireUser, isAdmin } from "@/lib/auth";
import { listTemplates } from "@/lib/services/templates";
import { listFavoriteTemplateIds, listDeletedTemplates } from "@/lib/services/favorites";
import { NewTemplateButton } from "@/components/templates/new-template";
import { TemplatesTable } from "@/components/templates/table";
import { DeletedTemplatesTable } from "@/components/templates/deleted-table";
import { cn } from "@/lib/cn";

export const metadata = { title: "Templates" };

const VIEWS = [
  { key: "mine", label: "My Templates", Icon: LayoutTemplate },
  { key: "shared", label: "Shared with Me", Icon: Users },
  { key: "favorites", label: "Favorites", Icon: Star },
  { key: "all", label: "All Templates", Icon: FolderOpen },
  { key: "deleted", label: "Deleted", Icon: Trash2 },
] as const;

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ view?: string; scope?: string; q?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const view = (VIEWS.some((v) => v.key === (sp.view || sp.scope)) ? (sp.view || sp.scope) : "all") as (typeof VIEWS)[number]["key"];
  const [templates, favs, deleted] = await Promise.all([
    view === "deleted" ? Promise.resolve([]) : listTemplates(user, { scope: view === "mine" || view === "shared" ? view : "all", q: sp.q }),
    listFavoriteTemplateIds(user),
    view === "deleted" ? listDeletedTemplates(user) : Promise.resolve([]),
  ]);
  const rows = (view === "favorites" ? templates.filter((t) => favs.has(t.id)) : templates).map((t) => ({ id: t.id, envelopeId: t.envelopeId, name: t.name, description: t.description, shared: t.shared, ownerId: t.ownerId, ownerName: t.ownerName, roleNames: t.roleNames, documentCount: t.documentCount, useCount: t.useCount, lastUsedAt: t.lastUsedAt ? new Date(t.lastUsedAt).toISOString() : null, updatedAt: new Date(t.updatedAt).toISOString(), favorite: favs.has(t.id) }));
  const title = VIEWS.find((v) => v.key === view)!.label;
  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <aside className="w-[248px] shrink-0 border-r border-hairline bg-white px-3 py-5 hidden md:block">
        <div className="px-3 mb-3"><NewTemplateButton /></div>
        <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Templates</div>
        {VIEWS.map(({ key, label, Icon }) => (
          <Link key={key} href={`/templates?view=${key}`} className={cn("flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13.5px] text-ink-2 hover:bg-paper-2", view === key && "bg-blush-1 text-ink font-medium")}><Icon size={15} className={view === key ? "text-rose-ink" : "text-muted"} />{label}</Link>
        ))}
      </aside>
      <main className="flex-1 min-w-0 px-4 sm:px-8 py-5 sm:py-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h1 className="text-[22px] font-semibold">{title} <span className="text-sm font-normal text-muted ml-1">{view === "deleted" ? deleted.length : rows.length}</span></h1>
          <form action="/templates" className="flex items-center h-9 w-[280px] rounded-[6px] border border-hairline bg-white px-2.5 gap-2 focus-within:border-ink">
            <input type="hidden" name="view" value={view} />
            <Search size={15} className="text-muted" />
            <input name="q" defaultValue={sp.q || ""} placeholder="Search templates" className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted" />
          </form>
        </div>
        {view === "deleted"
          ? <DeletedTemplatesTable rows={deleted.map((d) => ({ id: d.id, name: d.name, ownerName: d.ownerName, deletedAt: new Date(d.deletedAt).toISOString() }))} timezone={user.timezone} />
          : <TemplatesTable rows={rows} userId={user.id} isAdmin={isAdmin(user)} timezone={user.timezone} />}
      </main>
    </div>
  );
}
