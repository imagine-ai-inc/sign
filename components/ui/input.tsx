import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("h-9 w-full rounded-[6px] border border-hairline bg-white px-3 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink disabled:bg-paper", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("w-full rounded-[6px] border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink", className)} {...props} />;
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-[13px] font-medium text-ink-2", className)} {...props} />;
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function NativeSelect({ className, ...props }, ref) {
  return <select ref={ref} className={cn("h-9 rounded-[6px] border border-hairline bg-white px-2.5 text-sm text-ink focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink", className)} {...props} />;
});
