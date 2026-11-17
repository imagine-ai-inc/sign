"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Users, KeyRound, Building2, PenLine, Palette } from "lucide-react";
import { cn } from "@/lib/cn";

export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/settings", label: "My profile", Icon: User },
    { href: "/settings/users", label: "Users", Icon: Users },
    { href: "/settings/api", label: "API and webhooks", Icon: KeyRound },
    ...(isAdmin ? [{ href: "/settings/signing", label: "Signing settings", Icon: PenLine }, { href: "/settings/branding", label: "Branding", Icon: Palette }, { href: "/settings/workspace", label: "Workspace", Icon: Building2 }] : []),
  ];
  return (
    <>
    <div className="md:hidden flex gap-2 overflow-x-auto px-3 py-3 border-b border-hairline bg-white [scrollbar-width:none]">
      {items.map(({ href, label }) => <Link key={href} href={href} className={cn("shrink-0 h-8 px-3 rounded-full border text-[13px] inline-flex items-center", path === href ? "bg-ink text-white border-ink" : "bg-white border-hairline text-ink-2")}>{label}</Link>)}
    </div>
    <aside className="w-[248px] shrink-0 border-r border-hairline bg-white px-3 py-5 hidden md:block">
      <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{isAdmin ? "Admin" : "Settings"}</div>
      <div className="space-y-0.5">
        {items.map(({ href, label, Icon }) => {
          const active = path === href;
          return <Link key={href} href={href} className={cn("flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13.5px] text-ink-2 hover:bg-paper-2", active && "bg-blush-1 text-ink font-medium")}><Icon size={16} className={active ? "text-rose-ink" : "text-muted"} />{label}</Link>;
        })}
      </div>
    </aside>
    </>
  );
}
