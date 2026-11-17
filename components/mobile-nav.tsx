"use client";
import { brand } from "@/lib/brand";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, Search } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const items = [
    { href: "/", label: "Home" },
    { href: "/agreements", label: "Agreements" },
    { href: "/templates", label: "Templates" },
    { href: "/reports", label: "Reports" },
    { href: "/settings", label: isAdmin ? "Admin" : "Settings" },
    { href: "/developers", label: "API docs" },
  ];
  return (
    <>
      <button onClick={() => setOpen(true)} className="sm:hidden p-2 rounded hover:bg-paper-2" aria-label="Menu"><MenuIcon size={20} /></button>
      <Sheet open={open} onOpenChange={setOpen} title={brand.name}>
        <form action="/agreements" className="m-4 flex items-center h-10 rounded-[6px] border border-hairline bg-paper px-3 gap-2">
          <Search size={15} className="text-muted" />
          <input name="q" placeholder="Search agreements" className="bg-transparent outline-none text-sm flex-1" />
        </form>
        <nav className="pb-4">
          {items.map((it) => {
            const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
            return <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className={cn("block px-5 py-3 text-[15px] border-b border-hairline-2", active ? "font-semibold text-ink" : "text-ink-2")}>{it.label}</Link>;
          })}
        </nav>
      </Sheet>
    </>
  );
}
