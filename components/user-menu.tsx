"use client";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { LogOut, Settings, User, KeyRound } from "lucide-react";

export function UserMenu({ name, email, initials }: { name: string; email: string; initials: string }) {
  return (
    <Menu>
      <MenuTrigger className="h-9 w-9 rounded-full bg-blush-2 text-ink text-[13px] font-semibold flex items-center justify-center focus-ring" aria-label="Account">{initials}</MenuTrigger>
      <MenuContent>
        <div className="px-2.5 py-2">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted">{email}</div>
        </div>
        <MenuSeparator />
        <MenuItem href="/settings"><User size={15} /> My profile and signature</MenuItem>
        <MenuItem href="/settings/api"><KeyRound size={15} /> API and webhooks</MenuItem>
        <MenuItem href="/settings/users"><Settings size={15} /> Users</MenuItem>
        <MenuSeparator />
        <form action="/auth/signout" method="post">
          <button type="submit" className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left hover:bg-paper-2"><LogOut size={15} /> Log out</button>
        </form>
      </MenuContent>
    </Menu>
  );
}
