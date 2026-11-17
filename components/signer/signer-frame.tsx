"use client";
import type { ReactNode } from "react";
import { ChevronDown, Globe, LifeBuoy, Info } from "lucide-react";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { BrandLogo, PoweredBy } from "@/components/brand-logo";
import { brand, serviceLine } from "@/lib/brand";

/** Public signing chrome: logo header (+ subject and recipient menu) + paper body. */
export function SignerFrame({ children, right, subject, recipient, sender, onAbout }: {
  children: ReactNode;
  right?: ReactNode;
  subject?: string;
  recipient?: { name: string; email: string };
  sender?: { name: string; email: string };
  onAbout?: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <header className="h-14 bg-white border-b border-hairline sticky top-0 z-40">
        <div className="h-full px-4 sm:px-6 flex items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0" aria-label={brand.name}>
            <BrandLogo imgClass="h-[22px]" textClass="text-[20px]" />
          </div>
          {subject ? <><span className="hidden sm:block h-5 w-px bg-hairline" /><div className="hidden sm:block text-[13px] text-ink-2 truncate max-w-[360px]" title={subject}>{subject}</div></> : null}
          <div className="ml-auto flex items-center gap-2">
            {right}
            {recipient ? (
              <Menu>
                <MenuTrigger className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 rounded-[6px] border border-hairline text-[13px] hover:bg-paper-2 max-w-[260px]">
                  <span className="truncate">{recipient.name || recipient.email}</span>
                  <ChevronDown size={14} className="text-muted shrink-0" />
                </MenuTrigger>
                <MenuContent align="end" className="min-w-[240px]">
                  <div className="px-2.5 py-2">
                    <div className="text-sm font-medium truncate">{recipient.name}</div>
                    <div className="text-xs text-muted truncate">{recipient.email}</div>
                  </div>
                  <MenuSeparator />
                  <MenuItem disabled><Globe size={15} /> Change language</MenuItem>
                  {sender ? <MenuItem href={`mailto:${sender.email}?subject=${encodeURIComponent("Question about the document you sent")}`}><LifeBuoy size={15} /> Help</MenuItem> : null}
                  <MenuItem onSelect={onAbout}><Info size={15} /> About</MenuItem>
                </MenuContent>
              </Menu>
            ) : null}
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col">{children}</div>
      <footer className="px-6 py-4 text-center text-[11px] text-muted">{serviceLine()}{brand.poweredBy ? <> · <PoweredBy /></> : null}</footer>
    </div>
  );
}
