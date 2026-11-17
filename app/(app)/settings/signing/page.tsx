import { requireAdmin } from "@/lib/auth";
import { getWorkspaceSettings } from "@/lib/services/settings";
import { SigningSettingsForm } from "@/components/settings/signing-form";

export const metadata = { title: "Signing settings" };

export default async function SigningSettingsPage() {
  const user = await requireAdmin();
  const s = await getWorkspaceSettings(user);
  return (
    <>
      <h1 className="text-[22px] font-semibold">Signing settings</h1>
      <p className="text-sm text-muted mt-1">Defaults for every new envelope. Senders can override them per envelope.</p>
      <SigningSettingsForm settings={s} />
    </>
  );
}
