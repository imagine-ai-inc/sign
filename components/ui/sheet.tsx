"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Bottom sheet for phones (same Radix dialog primitive). */
export function Sheet({ open, onOpenChange, title, children, className }: { open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <D.Content className={cn("fixed inset-x-0 bottom-0 z-50 max-h-[82vh] rounded-t-2xl bg-white shadow-2xl border-t border-hairline flex flex-col", className)}>
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-hairline-2">
            <span className="mx-auto absolute left-1/2 -translate-x-1/2 top-1.5 h-1 w-10 rounded-full bg-hairline" />
            <D.Title className="text-sm font-semibold mt-1">{title}</D.Title>
            <D.Description className="sr-only">sheet</D.Description>
            <D.Close className="p-1.5 rounded hover:bg-paper-2 mt-1" aria-label="Close"><X size={18} /></D.Close>
          </div>
          <div className="overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
