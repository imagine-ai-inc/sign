"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-[200px] rounded-md border border-hairline bg-white p-1 shadow-lg text-sm", className)}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, onSelect, danger, disabled, href }: { children: React.ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; href?: string }) {
  const cls = cn("flex w-full cursor-pointer select-none items-center gap-2 rounded px-2.5 py-2 outline-none data-[highlighted]:bg-paper-2 data-[disabled]:opacity-40", danger && "text-bad");
  if (href) return <M.Item asChild disabled={disabled}><a href={href} className={cls}>{children}</a></M.Item>;
  return <M.Item className={cls} onSelect={onSelect} disabled={disabled}>{children}</M.Item>;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-hairline-2" />;
}
export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <M.Label className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</M.Label>;
}
