import Link from "next/link";
import { HelpCircle, Search } from "lucide-react";
import { initialsOf } from "@/lib/format";
import type { AppUser } from "@/lib/types";
import { UserMenu } from "@/components/user-menu";
import { NavTabs } from "@/components/nav-tabs";
import { MobileNav } from "@/components/mobile-nav";
import { BrandLogo } from "@/components/brand-logo";
import { brand } from "@/lib/brand";

export function AppShell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-16 bg-white border-b border-hairline sticky top-0 z-40">
        <div className="h-full px-4 sm:px-6 flex items-center gap-4 sm:gap-8">
          <MobileNav isAdmin={user.role === "owner" || user.role === "admin"} />
          <Link href="/" className="flex items-center gap-1.5 shrink-0" aria-label={`${brand.name} home`}>
            <BrandLogo imgClass="h-[26px]" textClass="text-[22px]" />
          </Link>
          <NavTabs isAdmin={user.role === "owner" || user.role === "admin"} />
          <div className="ml-auto flex items-center gap-2">
            <form action="/agreements" className="hidden md:flex items-center h-9 w-[260px] rounded-[6px] border border-hairline bg-paper px-2.5 gap-2 focus-within:border-ink">
              <Search size={15} className="text-muted" />
              <input name="q" placeholder="Search agreements" className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted" />
            </form>
            <Link href="/developers" className="hidden sm:inline-flex p-2 rounded-full text-muted hover:bg-paper-2 hover:text-ink" aria-label="Help and API docs"><HelpCircle size={19} /></Link>
            <UserMenu name={user.name || user.email} email={user.email} initials={initialsOf(user.name || user.email)} />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
