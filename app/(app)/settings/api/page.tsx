import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listApiKeys, listWebhooks } from "@/lib/services/users";
import { WEBHOOK_EVENTS } from "@/lib/services/webhooks";
import { ApiKeysCard, WebhooksCard } from "@/components/settings/api-cards";

export const metadata = { title: "API and webhooks" };

export default async function ApiPage() {
  const user = await requireUser();
  const [keys, hooks] = await Promise.all([listApiKeys(user), listWebhooks(user)]);
  return (
    <>
      <h1 className="text-[22px] font-semibold">API and webhooks</h1>
      <p className="text-sm text-muted mt-1">Send and track envelopes from scripts and agents. Read the <Link href="/developers" className="text-rose-ink hover:underline">developer docs</Link>.</p>
      <ApiKeysCard keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, userName: k.userName, lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null, createdAt: new Date(k.createdAt).toISOString(), revokedAt: k.revokedAt ? new Date(k.revokedAt).toISOString() : null }))} />
      <WebhooksCard hooks={hooks.map((h) => ({ id: h.id, url: h.url, events: h.events, active: h.active, description: h.description, createdAt: new Date(h.createdAt).toISOString() }))} events={[...WEBHOOK_EVENTS]} />
    </>
  );
}
