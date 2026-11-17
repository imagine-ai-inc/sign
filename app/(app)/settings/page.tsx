import { requireUser } from "@/lib/auth";
import { ProfileForm } from "@/components/settings/profile-form";
import { MySignatureCard } from "@/components/home/signature-editor";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const prefs = ((user as unknown as { notificationPrefs?: Record<string, boolean> }).notificationPrefs) || {};
  return (
    <>
      <h1 className="text-[22px] font-semibold">My profile</h1>
      <p className="text-sm text-muted mt-1">How you appear to recipients, and which emails you get.</p>
      <div className="mt-6"><MySignatureCard name={user.name || user.email} adoption={user.signature ? { fullName: user.signature.fullName, initials: user.signature.initials, adoptedAt: user.signature.adoptedAt } : null} /></div>
      <ProfileForm user={{ name: user.name, email: user.email, title: user.title || "", company: user.company || "", timezone: user.timezone, role: user.role, prefs: { viewed: prefs.viewed === true, signed: prefs.signed !== false, declined: prefs.declined !== false } }} />
    </>
  );
}
