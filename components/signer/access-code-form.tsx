"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { accessCodeAction } from "@/lib/actions/signer";

export function AccessCodeForm({ token, sender, subject }: { token: string; sender: { name: string; email: string }; subject: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-10">
      <form
        className="w-full max-w-[460px] bg-white border border-hairline rounded-xl p-8"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await accessCodeAction(token, code);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
      >
        <div className="w-12 h-12 rounded-full bg-blush-1 flex items-center justify-center"><KeyRound size={22} className="text-rose-ink" /></div>
        <h1 className="text-xl font-semibold mt-4">Enter the access code</h1>
        <p className="text-sm text-ink-2 mt-1">{sender.name} protected <span className="font-medium text-ink">{subject}</span> with an access code. Enter it to open the document.</p>
        <div className="mt-5 space-y-1.5">
          <Label htmlFor="code">Access code</Label>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" required />
        </div>
        {error ? <p className="text-sm text-bad mt-3">{error}</p> : null}
        <Button type="submit" className="w-full mt-5" disabled={pending || !code.trim()}>{pending ? "Checking..." : "Validate"}</Button>
        <p className="text-xs text-muted mt-4">Don&apos;t have the code? Ask <a className="text-rose-ink underline" href={`mailto:${sender.email}`}>{sender.email}</a>.</p>
      </form>
    </main>
  );
}
