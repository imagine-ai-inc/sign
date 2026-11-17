"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className, wide }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in" />
      <D.Content className={cn("fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-h-[calc(100vh-48px)] overflow-y-auto rounded-lg bg-white shadow-xl border border-hairline", wide ? "max-w-[760px]" : "max-w-[520px]", className)}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
          <div>
            <D.Title className="text-lg font-semibold text-ink">{title}</D.Title>
            {description ? <D.Description className="text-sm text-muted mt-1">{description}</D.Description> : <D.Description className="sr-only">dialog</D.Description>}
          </div>
          <D.Close className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink" aria-label="Close"><X size={18} /></D.Close>
        </div>
        <div className="px-6 pb-6">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
