/**
 * MCP endpoint: <APP_URL>/api/mcp
 * Streamable HTTP, stateless. The caller's Bearer isk_ key is passed through to REST v1, which is
 * called in-process (same handlers, auth, audit trail and errors as /api/v1, no network hop).
 */
import { handleMcpHttp } from "@/lib/mcp/server";
import { handleApiRequest } from "@/lib/api/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const inProcessFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
  handleApiRequest(new Request(input, init), { via: "mcp" })) as typeof fetch;

const base = (req: Request) => `${new URL(req.url).origin}/api/v1`;

export async function POST(req: Request) {
  return handleMcpHttp(req, { baseUrl: base(req), fetch: inProcessFetch });
}
export async function GET(req: Request) { return handleMcpHttp(req); }
export async function DELETE(req: Request) { return handleMcpHttp(req); }
export async function OPTIONS(req: Request) { return handleMcpHttp(req); }
