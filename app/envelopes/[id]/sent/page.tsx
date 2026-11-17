import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { assertView } from "@/lib/services/access";
import { getBundle } from "@/lib/services/envelopes";
import { LinkButton } from "@/components/ui/button";
import { envelopeIdDisplay } from "@/lib/format";
import { signNowAction } from "@/lib/actions/builder";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Envelope sent" };

export default async function SentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  await assertView(user, id);
  const b = await getBundle(id);
  const next = b.recipients.filter((r) => r.status === "sent" || r.status === "delivered");
  const mine = next.find((r) => r.email.toLowerCase() === user.email.toLowerCase());
  const onlyMe = mine && b.recipients.filter((r) => r.role !== "cc").length === 1;
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-[560px] w-full bg-white border border-hairline rounded-xl p-10 text-center">
        <CheckCircle2 size={56} className="mx-auto text-ok" strokeWidth={1.5} />
        <h1 className="font-serif text-[34px] mt-4">{onlyMe ? "Your document is ready to sign" : "Your envelope was sent"}</h1>
        <p className="text-sm text-ink-2 mt-2">
          {onlyMe ? <>You&apos;re the only signer. Sign it now and the completed copy will be emailed to you.</> : next.length ? <>We emailed {next.map((r) => r.name).join(", ")}. You&apos;ll get an email when it&apos;s complete.</> : <>Everyone has been notified.</>}
        </p>
        <p className="text-xs text-muted mt-3">Envelope ID {envelopeIdDisplay(id)}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {mine ? (
            <form action={signNowAction.bind(null, id)}><Button type="submit">Sign now</Button></form>
          ) : null}
          <LinkButton href={`/agreements/${id}`} variant={mine ? "secondary" : "primary"}>View envelope</LinkButton>
          <LinkButton href="/" variant="secondary">Send another</LinkButton>
          <Link href="/agreements" className="text-sm text-rose-ink hover:underline">Go to Agreements</Link>
        </div>
      </div>
    </main>
  );
}
