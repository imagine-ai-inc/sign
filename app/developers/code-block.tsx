"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[8px] bg-[#141414] text-[#F4F1EF] overflow-hidden border border-[#141414] min-w-0">
      <div className="flex items-center justify-between h-9 px-4 border-b border-white/10">
        <span className="text-[11.5px] uppercase tracking-[0.08em] text-[#B8AFAB]">{label ?? ""}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            });
          }}
          className="inline-flex items-center gap-1.5 text-[12px] text-[#B8AFAB] hover:text-white"
          aria-label="Copy code"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-4 py-3.5 text-[12.5px] leading-[1.6] overflow-x-auto font-mono whitespace-pre"><code>{code}</code></pre>
    </div>
  );
}
