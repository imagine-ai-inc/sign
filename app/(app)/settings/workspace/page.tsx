import { requireAdmin } from "@/lib/auth";
import { getWorkspaceSettings } from "@/lib/services/settings";
import { WorkspaceForm } from "@/components/settings/workspace-form";

export const metadata = { title: "Workspace" };

export default async function WorkspacePage() {
  const user = await requireAdmin();
  const s = await getWorkspaceSettings(user);
  return (
    <>
      <h1 className="text-[22px] font-semibold">Workspace</h1>
      <p className="text-sm text-muted mt-1">Defaults for new envelopes. Senders can change them per envelope.</p>
      <WorkspaceForm settings={s} />
    </>
  );
}
