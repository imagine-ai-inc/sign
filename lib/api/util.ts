/** Pure helpers for the REST API (no server-only imports, unit tested in tests/api). */

export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  if (!m) return null;
  const key = m[1];
  return /^isk_[A-Za-z0-9_-]{16,}$/.test(key) ? key : null;
}

/** Opaque offset cursor so we can switch to keyset pagination later without breaking clients. */
export function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const s = Buffer.from(cursor, "base64url").toString("utf8");
    const m = /^o:(\d{1,9})$/.exec(s);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

/** Splits a URL path after /api/v1 into segments, ignoring empty ones. */
export function segments(pathname: string): string[] {
  const i = pathname.indexOf("/api/v1");
  const rest = i >= 0 ? pathname.slice(i + "/api/v1".length) : pathname;
  return rest.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
}

/** Blocks SSRF to obviously private hosts for "documents[].url". DNS rebinding is out of scope (https only, no redirects to private hosts checked per hop). */
export function isFetchableUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  if (h.includes(":")) {
    if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:")) return false;
  }
  return true;
}

/** Decodes base64 or a data: URL into bytes. */
export function decodeBase64Pdf(input: string): Uint8Array {
  const s = input.trim().replace(/^data:application\/pdf;base64,/i, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(s)) throw new Error("not base64");
  return new Uint8Array(Buffer.from(s, s.includes("-") || s.includes("_") ? "base64url" : "base64"));
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  // %PDF- may be preceded by up to 1024 bytes of junk per the spec
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 1024))).toString("latin1");
  return head.includes("%PDF-");
}

export type RecipientRef = number | string;

/**
 * Resolves a field's `recipient` reference (0-based index, email, template role name or recipient id)
 * against the envelope's recipients. Returns the recipient id or null.
 */
export function resolveRecipientRef(
  ref: RecipientRef,
  recipients: { id: string; email: string; templateRole: string | null; name: string }[],
): string | null {
  if (typeof ref === "number") return Number.isInteger(ref) && ref >= 0 && ref < recipients.length ? recipients[ref].id : null;
  const s = String(ref).trim();
  if (/^\d+$/.test(s)) {
    const i = Number(s);
    return i < recipients.length ? recipients[i].id : null;
  }
  const lower = s.toLowerCase();
  return (
    recipients.find((r) => r.id === s)?.id ??
    recipients.find((r) => r.email.toLowerCase() === lower)?.id ??
    recipients.find((r) => (r.templateRole || "").toLowerCase() === lower)?.id ??
    recipients.find((r) => r.name.toLowerCase() === lower)?.id ??
    null
  );
}

/** Maps the public `status` filter onto the app's folder keys. */
export function statusToFolder(status: string | null | undefined): string {
  switch ((status || "").toLowerCase()) {
    case "":
    case "all":
      return "all";
    case "draft":
    case "drafts":
      return "drafts";
    case "sent":
    case "in_progress":
      return "status:sent";
    case "completed":
      return "completed";
    case "voided":
      return "voided";
    case "declined":
      return "declined";
    case "expired":
      return "status:expired";
    case "deleted":
      return "deleted";
    case "action_required":
      return "action_required";
    case "waiting":
    case "waiting_for_others":
      return "waiting";
    case "expiring":
    case "expiring_soon":
      return "expiring";
    case "inbox":
      return "inbox";
    default:
      return "__invalid__";
  }
}

export const STATUS_FILTERS = ["all", "draft", "sent", "completed", "declined", "voided", "expired", "deleted", "action_required", "waiting", "expiring", "inbox"] as const;
