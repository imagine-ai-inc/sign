import { brand } from "../brand";
/**
 * Stateless MCP server over Streamable HTTP (spec 2025-06-18), no SDK dependency.
 * POST JSON-RPC (single or batch) -> application/json response. No server-initiated streams,
 * so GET returns 405 (allowed by the spec) and no session ids are issued.
 * Auth: the caller's Bearer isk_ key is passed straight through to REST v1; the MCP layer stores nothing.
 */
import { ImagineSignClient, ImagineSignError } from "./client";
import { toolMap, tools, validateArgs } from "./tools";
import { parseBearer } from "../api/util";

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "imagine-sign", title: brand.name, version: "0.1.0" };

const INSTRUCTIONS = `${brand.name} is an e-signature platform (a self-hosted Imagine Sign instance).
Typical flow: list_templates -> get_template -> create_envelope (status "draft") -> show the user links.app -> send_envelope only after explicit approval -> get_envelope to track -> download_completed.
Sending, voiding and resending email real people: confirm with the user first. Signing links are secrets.`;

interface RpcRequest { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> }
interface RpcResponse { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } }

const ERR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 };

export interface McpContext { apiKey: string; baseUrl: string; fetch?: typeof fetch }

function rpcError(id: RpcResponse["id"], code: number, message: string, data?: unknown): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

async function handleOne(req: RpcRequest, ctx: McpContext): Promise<RpcResponse | null> {
  const id = req.id ?? null;
  const isNotification = req.id === undefined;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") return isNotification ? null : rpcError(id, ERR.invalidRequest, "Invalid JSON-RPC request");

  switch (req.method) {
    case "initialize": {
      const asked = String(req.params?.protocolVersion ?? "");
      const protocolVersion = MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0];
      return { jsonrpc: "2.0", id, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS } };
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0", id,
        result: { tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) },
      };
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const tool = toolMap.get(name);
      if (!tool) return rpcError(id, ERR.invalidParams, `Unknown tool: ${name}`);
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      const bad = validateArgs(tool, args);
      if (bad) return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `Invalid arguments for ${name}: ${bad}` }] } };
      const client = new ImagineSignClient({ baseUrl: ctx.baseUrl, apiKey: ctx.apiKey, fetch: ctx.fetch });
      try {
        const out = await tool.handler(args, client);
        const structured = out && typeof out === "object" && !Array.isArray(out) ? (out as Record<string, unknown>) : { result: out };
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: structured } };
      } catch (e) {
        // Tool errors go back to the model as isError results (spec), not protocol errors.
        const msg = e instanceof ImagineSignError ? `${e.code} (HTTP ${e.status}): ${e.message}` : `internal_error: ${(e as Error).message}`;
        return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: msg }] } };
      }
    }
    case "resources/list": return { jsonrpc: "2.0", id, result: { resources: [] } };
    case "prompts/list": return { jsonrpc: "2.0", id, result: { prompts: [] } };
    default:
      return isNotification ? null : rpcError(id, ERR.methodNotFound, `Method not found: ${req.method}`);
  }
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, accept",
  "access-control-expose-headers": "mcp-protocol-version",
};

export function bearer(req: Request): string | null {
  return parseBearer(req.headers.get("authorization"));
}

/** Full HTTP handler. `baseUrl` = REST v1 base, normally `${origin}/api/v1`. */
export async function handleMcpHttp(req: Request, opts: { baseUrl?: string; fetch?: typeof fetch } = {}): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method === "GET") return new Response(`${brand.name} MCP: POST JSON-RPC here (Streamable HTTP, no SSE stream).`, { status: 405, headers: { ...cors, allow: "POST, OPTIONS" } });
  if (req.method === "DELETE") return new Response(null, { status: 405, headers: { ...cors, allow: "POST, OPTIONS" } });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: cors });

  const key = bearer(req);
  if (!key || !key.startsWith("isk_")) {
    return new Response(JSON.stringify({ error: { code: "unauthorized", message: "Send Authorization: Bearer isk_... (an API key from Settings > API keys)." } }), {
      status: 401, headers: { ...cors, "content-type": "application/json", "www-authenticate": 'Bearer realm="imagine-sign"' },
    });
  }

  let payload: unknown;
  try { payload = await req.json(); } catch {
    return Response.json(rpcError(null, ERR.parse, "Parse error"), { status: 400, headers: cors });
  }

  const baseUrl = opts.baseUrl ?? `${new URL(req.url).origin}/api/v1`;
  const ctx: McpContext = { apiKey: key, baseUrl, fetch: opts.fetch };
  const batch = Array.isArray(payload);
  const reqs = (batch ? payload : [payload]) as RpcRequest[];
  if (!reqs.length) return Response.json(rpcError(null, ERR.invalidRequest, "Empty batch"), { status: 400, headers: cors });

  const results = (await Promise.all(reqs.map((r) => handleOne(r, ctx).catch((e) => rpcError(r?.id ?? null, ERR.internal, (e as Error).message))))).filter(Boolean) as RpcResponse[];
  const headers = { ...cors, "mcp-protocol-version": req.headers.get("mcp-protocol-version") ?? MCP_PROTOCOL_VERSIONS[0] };
  if (!results.length) return new Response(null, { status: 202, headers }); // only notifications/responses
  return Response.json(batch ? results : results[0], { headers });
}
