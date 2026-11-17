"use client";
import { useRef, useState } from "react";
import { ShieldCheck, ShieldX, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Result = { match: false } | { match: true; envelopeId: string; subject: string; completedAt: string; signers: string[] };

export function VerifyDropzone() {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(Result & { sha: string; name: string }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function check(file: File) {
    setBusy(true); setErr(null); setRes(null);
    try {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha256: sha }) });
      const j = (await r.json()) as Result;
      setRes({ ...j, sha, name: file.name });
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not verify"); }
    setBusy(false);
  }
  return (
    <div className="mt-8">
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) check(f); }}
        className={cn("rounded-lg border-2 border-dashed bg-white flex flex-col items-center text-center px-6 py-10", over ? "border-ink" : "border-hairline")}>
        <UploadCloud size={34} className="text-muted" strokeWidth={1.4} />
        <p className="mt-3 text-[15px] font-medium">{busy ? "Checking..." : "Drop the PDF here"}</p>
        <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) check(f); e.target.value = ""; }} />
        <Button className="mt-4" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>Choose file</Button>
      </div>
      {err ? <p className="mt-3 text-sm text-bad">{err}</p> : null}
      {res ? (
        <div className={cn("mt-5 rounded-lg border p-5", res.match ? "bg-ok-bg border-ok/30" : "bg-bad-bg border-bad/30")}>
          <div className="flex items-start gap-3">
            {res.match ? <ShieldCheck className="text-ok shrink-0" size={26} /> : <ShieldX className="text-bad shrink-0" size={26} />}
            <div className="min-w-0">
              <div className="font-semibold">{res.match ? "This document matches a completed envelope" : "No match"}</div>
              {res.match ? (
                <dl className="mt-2 text-sm grid grid-cols-[120px_1fr] gap-y-1">
                  <dt className="text-muted">Envelope ID</dt><dd className="font-mono text-[12.5px]">{res.envelopeId}</dd>
                  <dt className="text-muted">Subject</dt><dd>{res.subject}</dd>
                  <dt className="text-muted">Completed</dt><dd>{new Date(res.completedAt).toLocaleString()}</dd>
                  <dt className="text-muted">Signed by</dt><dd>{res.signers.join(", ") || "n/a"}</dd>
                </dl>
              ) : <p className="text-sm text-ink-2 mt-1">{res.name} isn&apos;t byte for byte identical to any completed document we issued. It may have been edited, re-saved or printed to PDF again. Ask the sender for the original completed file.</p>}
              <div className="mt-2 text-[11px] text-muted font-mono break-all">SHA-256 {res.sha}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
