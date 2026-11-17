"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" aria-label="Copy" onClick={() => { navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }} className="inline-flex align-middle text-muted hover:text-ink ml-1">{done ? <Check size={13} /> : <Copy size={13} />}</button>;
}
