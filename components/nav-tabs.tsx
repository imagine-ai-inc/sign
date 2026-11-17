"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function NavTabs({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: "/", label: "Home", active: path === "/" },
    { href: "/agreements", label: "Agreements", active: path.startsWith("/agreements") || path.startsWith("/envelopes") },
    { href: "/templates", label: "Templates", active: path.startsWith("/templates") },
    { href: "/reports", label: "Reports", active: path.startsWith("/reports") },
    { href: "/settings", label: isAdmin ? "Admin" : "Settings", active: path.startsWith("/settings") },
  ];
  return (
    <nav className="hidden sm:flex h-full items-stretch gap-1">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={cn("relative flex items-center px-3 text-[14px] font-medium text-ink-2 hover:text-ink", t.active && "text-ink")}>
          {t.label}
          {t.active ? <span className="absolute left-3 right-3 bottom-0 h-[3px] rounded-t bg-ink" /> : null}
        </Link>
      ))}
    </nav>
  );
}
