import { requireAdmin } from "@/lib/auth";
import { getWorkspaceSettings } from "@/lib/services/settings";
import { BrandingForm } from "@/components/settings/branding-form";

export const metadata = { title: "Branding" };

export default async function BrandingPage() {
  const user = await requireAdmin();
  const s = await getWorkspaceSettings(user);
  return (
    <>
      <h1 className="text-[22px] font-semibold">Branding</h1>
      <p className="text-sm text-muted mt-1">How recipients see your company in emails and on the signing page.</p>
      <BrandingForm settings={s} />
    </>
  );
}
