import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseBearer, encodeCursor, decodeCursor, segments, isFetchableUrl, decodeBase64Pdf, looksLikePdf,
  resolveRecipientRef, statusToFolder, STATUS_FILTERS,
} from "../../lib/api/util";
import { createEnvelopeBody, patchEnvelopeBody, fieldInput, voidBody, commentBody, webhookBody } from "../../lib/api/schemas";
import { buildOpenApi } from "../../lib/api/openapi";

const root = join(__dirname, "..", "..");

describe("auth header", () => {
  it("accepts only Bearer isk_ keys", () => {
    expect(parseBearer("Bearer isk_abcdefghijklmnopqrstuvwx")).toBe("isk_abcdefghijklmnopqrstuvwx");
    expect(parseBearer("bearer   isk_abcdefghijklmnop-_12  ")).toBe("isk_abcdefghijklmnop-_12");
    expect(parseBearer("Bearer sk_live_abcdefghijklmnopqrstu")).toBeNull();
    expect(parseBearer("Bearer isk_short")).toBeNull();
    expect(parseBearer("Basic isk_abcdefghijklmnopqrstuvwx")).toBeNull();
    expect(parseBearer("Bearer isk_abcdefghijklmnop qrs")).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });
});

describe("pagination + paths", () => {
  it("round-trips cursors and ignores garbage", () => {
    expect(decodeCursor(encodeCursor(40))).toBe(40);
    expect(decodeCursor("not-a-cursor")).toBe(0);
    expect(decodeCursor(null)).toBe(0);
  });
  it("splits paths after /api/v1", () => {
    expect(segments("/api/v1/envelopes/abc/recipients/def/signing-link")).toEqual(["envelopes", "abc", "recipients", "def", "signing-link"]);
    expect(segments("/api/v1")).toEqual([]);
    expect(segments("/api/v1/")).toEqual([]);
  });
  it("maps every public status filter to a folder", () => {
    for (const s of STATUS_FILTERS) expect(statusToFolder(s)).not.toBe("__invalid__");
    expect(statusToFolder("sent")).toBe("status:sent");
    expect(statusToFolder("expired")).toBe("status:expired");
    expect(statusToFolder("draft")).toBe("drafts");
    expect(statusToFolder(undefined)).toBe("all");
    expect(statusToFolder("bogus")).toBe("__invalid__");
  });
});

describe("document inputs", () => {
  it("blocks SSRF targets", () => {
    expect(isFetchableUrl("https://example.com/a.pdf")).toBe(true);
    for (const bad of ["http://example.com/a.pdf", "https://localhost/a.pdf", "https://127.0.0.1/a", "https://10.1.2.3/a", "https://192.168.1.1/a", "https://172.20.0.1/a", "https://169.254.169.254/latest/meta-data", "https://[::1]/a", "https://user:pw@example.com/a", "https://metadata.internal/x", "file:///etc/passwd", "not a url"]) {
      expect(isFetchableUrl(bad), bad).toBe(false);
    }
  });
  it("decodes base64 and data URLs, sniffs PDFs", () => {
    const pdf = Buffer.from("%PDF-1.7\n%...\n");
    expect(looksLikePdf(decodeBase64Pdf(pdf.toString("base64")))).toBe(true);
    expect(looksLikePdf(decodeBase64Pdf(`data:application/pdf;base64,${pdf.toString("base64")}`))).toBe(true);
    expect(looksLikePdf(new Uint8Array(Buffer.from("<html>")))).toBe(false);
    expect(() => decodeBase64Pdf("***")).toThrow();
  });
});

describe("recipient references", () => {
  const recs = [
    { id: "r1", email: "jordan@example.com", templateRole: "Customer", name: "Jordan Lee" },
    { id: "r2", email: "alex@example.com", templateRole: "Acme Inc", name: "Alex Kim" },
  ];
  it("resolves index, email, role, id and name", () => {
    expect(resolveRecipientRef(0, recs)).toBe("r1");
    expect(resolveRecipientRef("1", recs)).toBe("r2");
    expect(resolveRecipientRef("ALEX@example.com", recs)).toBe("r2");
    expect(resolveRecipientRef("customer", recs)).toBe("r1");
    expect(resolveRecipientRef("r2", recs)).toBe("r2");
    expect(resolveRecipientRef("Jordan Lee", recs)).toBe("r1");
    expect(resolveRecipientRef(5, recs)).toBeNull();
    expect(resolveRecipientRef("nobody@example.com", recs)).toBeNull();
  });
});

describe("request schemas", () => {
  it("requires a template or documents and defaults to draft", () => {
    expect(createEnvelopeBody.safeParse({ subject: "x" }).success).toBe(false);
    const t = createEnvelopeBody.parse({ templateId: "6a1f3e0c-0000-4000-8000-000000000001", roles: [{ role: "Customer", name: "J", email: "j@example.com" }] });
    expect(t.status).toBe("draft");
    expect(createEnvelopeBody.safeParse({ documents: [{ name: "a.pdf", base64: "JVBERi0xLjcK" }], recipients: [{ name: "J", email: "j@example.com" }] }).success).toBe(true);
  });
  it("wants exactly one document source", () => {
    expect(createEnvelopeBody.safeParse({ documents: [{ name: "a.pdf" }] }).success).toBe(false);
    expect(createEnvelopeBody.safeParse({ documents: [{ base64: "JVBERi0xLjcK", url: "https://example.com/a.pdf" }] }).success).toBe(false);
  });
  it("parses explicit and anchor fields", () => {
    const a = fieldInput.parse({ recipient: 0, type: "signature", anchor: "/sig1/", offsetY: -4, width: 150 });
    expect("anchor" in a && a.anchor).toBe("/sig1/");
    const e = fieldInput.parse({ recipient: "jordan@example.com", type: "date_signed", page: 0, x: 0.1, y: 0.8 });
    expect("page" in e && e.document).toBe(0);
    expect(fieldInput.safeParse({ recipient: 0, type: "signature", page: 0, x: 1.4, y: 0 }).success).toBe(false);
    expect(fieldInput.safeParse({ recipient: 0, type: "stamp", anchor: "/x/" }).success).toBe(false);
  });
  it("validates small bodies", () => {
    expect(voidBody.safeParse({ reason: " " }).success).toBe(false);
    expect(commentBody.parse({ body: "hi" }).visibility).toBe("internal");
    expect(webhookBody.parse({ url: "https://example.com/h" }).events).toEqual(["*"]);
    expect(patchEnvelopeBody.safeParse({ subject: "x".repeat(301) }).success).toBe(false);
  });
});

describe("openapi", () => {
  const doc = buildOpenApi("https://sign.example.com/api/v1");
  const routerSrc = readFileSync(join(root, "lib/api/router.ts"), "utf8");
  const registered = [...routerSrc.matchAll(/route\("(GET|POST|PATCH|DELETE)", "([^"]+)"/g)].map(([, m, p]) => `${m} /${p.replace(/:(\w+)/g, "{$1}")}`);
  const documented = Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops as object).map((m) => `${m.toUpperCase()} ${p}`));

  it("is 3.1 with bearer auth and the right server", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe("https://sign.example.com/api/v1");
    expect(doc.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });
  it("documents every router endpoint and nothing extra", () => {
    expect(registered.length).toBeGreaterThan(20);
    for (const r of registered) expect(documented, r).toContain(r);
    for (const d of documented.filter((d) => d !== "GET /openapi.json")) expect(registered, d).toContain(d);
  });
  it("has unique operationIds and resolvable refs", () => {
    const ids = Object.values(doc.paths).flatMap((ops) => Object.values(ops as Record<string, { operationId: string }>).map((o) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
    const text = JSON.stringify(doc);
    for (const [, kind, name] of text.matchAll(/"#\/components\/(schemas|responses)\/(\w+)"/g)) {
      expect((doc.components as Record<string, Record<string, unknown>>)[kind][name], `${kind}/${name}`).toBeDefined();
    }
  });
  it("covers every ARCHITECTURE.md REST v1 endpoint", () => {
    const arch = readFileSync(join(root, "ARCHITECTURE.md"), "utf8").split("## REST API v1")[1].split("\n## ")[0];
    const lines = [...arch.matchAll(/`(GET|POST|PATCH|DELETE)(?:\|POST)?\s+([^`]+)`/g)];
    expect(lines.length).toBeGreaterThan(8);
    const all = documented.join("\n");
    for (const [, , path] of lines) {
      const p = path.split("?")[0].trim().replace(/\{recipientId\}/, "{rid}");
      expect(all, p).toContain(` ${p}`);
    }
  });
});
