import { requireUser, isAdmin } from "@/lib/auth";
import { SettingsNav } from "@/components/settings/nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-64px)]">
      <SettingsNav isAdmin={isAdmin(user)} />
      <main className="flex-1 min-w-0 px-4 sm:px-8 py-5 sm:py-6 max-w-[900px]">{children}</main>
    </div>
  );
}
