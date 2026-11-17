/**
 * Thin typed client over Imagine Sign REST v1 (contract: ARCHITECTURE.md "REST API v1").
 * Used by the MCP server (key passthrough) and by agents/scripts directly.
 */
export class ImagineSignError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ImagineSignError";
    this.status = status;
    this.code = code;
  }
}

export interface ClientOptions {
  baseUrl: string; // e.g. https://sign.example.com/api/v1
  apiKey: string; // isk_...
  fetch?: typeof fetch;
}

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export class ImagineSignClient {
  private base: string;
  private key: string;
  private f: typeof fetch;

  constructor(o: ClientOptions) {
    this.base = o.baseUrl.replace(/\/+$/, "");
    this.key = o.apiKey;
    this.f = o.fetch ?? fetch;
  }

  async request<T = unknown>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined | null>): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    const res = await this.f(url, {
      method,
      headers: {
        authorization: `Bearer ${this.key}`,
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ImagineSignError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? (text.slice(0, 300) || res.statusText));
    }
    return data as T;
  }

  me() { return this.request("GET", "/me"); }
  listTemplates(q?: string) { return this.request("GET", "/templates", undefined, { q }); }
  getTemplate(id: string) { return this.request("GET", `/templates/${enc(id)}`); }
  createEnvelope(body: Record<string, unknown>) { return this.request("POST", "/envelopes", body); }
  listEnvelopes(q: { status?: string; q?: string; limit?: number; cursor?: string } = {}) { return this.request("GET", "/envelopes", undefined, q); }
  getEnvelope(id: string) { return this.request("GET", `/envelopes/${enc(id)}`); }
  updateEnvelope(id: string, body: Record<string, unknown>) { return this.request("PATCH", `/envelopes/${enc(id)}`, body); }
  sendEnvelope(id: string) { return this.request("POST", `/envelopes/${enc(id)}/send`, {}); }
  voidEnvelope(id: string, reason: string) { return this.request("POST", `/envelopes/${enc(id)}/void`, { reason }); }
  resendEnvelope(id: string, recipientId?: string) { return this.request("POST", `/envelopes/${enc(id)}/resend`, recipientId ? { recipientId } : {}); }
  signingLink(id: string, recipientId: string) { return this.request("POST", `/envelopes/${enc(id)}/recipients/${enc(recipientId)}/signing-link`, {}); }
  events(id: string) { return this.request("GET", `/envelopes/${enc(id)}/events`); }
  comments(id: string) { return this.request("GET", `/envelopes/${enc(id)}/comments`); }
  addComment(id: string, body: Record<string, unknown>) { return this.request("POST", `/envelopes/${enc(id)}/comments`, body); }
  /** URLs only: the agent gets a link, never megabytes of PDF in context. */
  completedUrl(id: string) { return `${this.base}/envelopes/${enc(id)}/documents/combined`; }
  certificateUrl(id: string) { return `${this.base}/envelopes/${enc(id)}/certificate`; }
}

const enc = encodeURIComponent;
