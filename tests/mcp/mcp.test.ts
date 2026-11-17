import { describe, it, expect } from "vitest";
import { handleMcpHttp } from "../../lib/mcp/server";

type Call = { method: string; url: string; auth: string | null; body: unknown };

function fakeRest() {
  const calls: Call[] = [];
  const f = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? "GET", url, auth: (init?.headers as Record<string, string>)?.authorization ?? null, body });
    const path = new URL(url).pathname;
    if (path.endsWith("/me")) return Response.json({ user: { email: "owner@example.com" } });
    if (path.endsWith("/templates")) return Response.json({ data: [{ id: "tpl_1", name: "SaaS Services Order Form" }] });
    if (path.endsWith("/envelopes") && init?.method === "POST") return Response.json({ id: "env_1", status: body.status, recipients: [{ id: "rcp_1" }] }, { status: 201 });
    if (path.endsWith("/envelopes/env_1")) return Response.json({ id: "env_1", status: "sent" });
    if (path.endsWith("/envelopes/env_done")) return Response.json({ id: "env_done", status: "completed" });
    if (path.endsWith("/void")) return Response.json({ error: { code: "conflict", message: "Envelope already completed" } }, { status: 409 });
    return Response.json({ error: { code: "not_found", message: "nope" } }, { status: 404 });
  }) as typeof fetch;
  return { calls, f };
}

const post = (body: unknown, key = "isk_test_0123456789abcdef", extra: Record<string, string> = {}) =>
  new Request("https://sign.example.com/api/mcp", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });

describe("mcp server", () => {
  it("rejects missing / non-isk keys", async () => {
    const r = await handleMcpHttp(new Request("https://x/api/mcp", { method: "POST", body: "{}" }));
    expect(r.status).toBe(401);
    expect((await handleMcpHttp(post({}, "sk_live_x"))).status).toBe(401);
  });

  it("initialize + tools/list", async () => {
    const init = await (await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }))).json();
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.serverInfo.name).toBe("imagine-sign");
    const n = await handleMcpHttp(post({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(n.status).toBe(202);
    const list = await (await handleMcpHttp(post({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).json();
    const names = list.result.tools.map((t: { name: string }) => t.name);
    for (const t of ["list_templates", "get_template", "create_envelope", "send_envelope", "get_envelope", "list_envelopes", "void_envelope", "resend_envelope", "get_signing_link", "download_completed", "add_comment"]) expect(names).toContain(t);
  });

  it("passes the key through and defaults create_envelope to draft", async () => {
    const { calls, f } = fakeRest();
    const res = await (await handleMcpHttp(post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_envelope", arguments: { templateId: "tpl_1", subject: "Order form", recipients: [{ name: "Jordan Lee", email: "jordan@example.com", roleName: "Customer" }], prefill: { Company: "Example Co" } } } }), { baseUrl: "https://sign.example.com/api/v1", fetch: f })).json();
    expect(res.result.isError).toBeUndefined();
    expect(res.result.structuredContent.status).toBe("draft");
    expect(calls[0].auth).toBe("Bearer isk_test_0123456789abcdef");
    expect(calls[0].url).toBe("https://sign.example.com/api/v1/envelopes");
  });

  it("returns REST errors as tool isError results", async () => {
    const { f } = fakeRest();
    const res = await (await handleMcpHttp(post({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "void_envelope", arguments: { envelopeId: "env_1", reason: "x" } } }), { baseUrl: "https://s/api/v1", fetch: f })).json();
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/conflict \(HTTP 409\)/);
  });

  it("validates arguments and unknown tools", async () => {
    const { f } = fakeRest();
    const bad = await (await handleMcpHttp(post({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_envelope", arguments: {} } }), { fetch: f })).json();
    expect(bad.result.isError).toBe(true);
    const unk = await (await handleMcpHttp(post({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope" } }), { fetch: f })).json();
    expect(unk.error.code).toBe(-32602);
    const noDocs = await (await handleMcpHttp(post({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "create_envelope", arguments: { recipients: [{ name: "a", email: "a@b.co" }] } } }), { fetch: f })).json();
    expect(noDocs.result.isError).toBe(true);
  });

  it("download_completed only when completed, returns URLs", async () => {
    const { f } = fakeRest();
    const done = await (await handleMcpHttp(post({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "download_completed", arguments: { envelopeId: "env_done" } } }), { baseUrl: "https://s/api/v1", fetch: f })).json();
    expect(done.result.structuredContent.combinedPdfUrl).toBe("https://s/api/v1/envelopes/env_done/documents/combined");
    const notYet = await (await handleMcpHttp(post({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "download_completed", arguments: { envelopeId: "env_1" } } }), { baseUrl: "https://s/api/v1", fetch: f })).json();
    expect(notYet.result.isError).toBe(true);
  });

  it("supports batches", async () => {
    const r = await (await handleMcpHttp(post([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "tools/list" }]))).json();
    expect(r).toHaveLength(2);
  });
});
