"use client";
import { useActionState } from "react";
import { requestCode, verifyCode, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginForm({ next }: { next: string }) {
  const [emailState, sendCode, sending] = useActionState<LoginState, FormData>(requestCode, { step: "email", next });
  const [codeState, checkCode, checking] = useActionState<LoginState, FormData>(verifyCode, { step: "code", next });
  const onCode = emailState.step === "code";
  if (!onCode) {
    return (
      <form action={sendCode} className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Log in</h1>
          <p className="text-sm text-muted mt-1">We&apos;ll email you a 6 digit code.</p>
        </div>
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={emailState.email} placeholder="you@company.com" autoFocus required />
        </div>
        {emailState.error ? <p className="text-sm text-bad">{emailState.error}</p> : null}
        <Button type="submit" className="w-full" disabled={sending}>{sending ? "Sending..." : "Continue"}</Button>
      </form>
    );
  }
  return (
    <form action={checkCode} className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-muted mt-1">Enter the code we sent to <span className="text-ink">{emailState.email}</span>.</p>
      </div>
      <input type="hidden" name="email" value={emailState.email} />
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={10} autoFocus required className="tracking-[0.4em] text-lg" />
      </div>
      {codeState.error ? <p className="text-sm text-bad">{codeState.error}</p> : null}
      <Button type="submit" className="w-full" disabled={checking}>{checking ? "Checking..." : "Log in"}</Button>
      <a href="/login" className="block text-center text-sm text-muted hover:text-ink">Use a different email</a>
    </form>
  );
}
