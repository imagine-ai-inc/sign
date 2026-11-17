/**
 * REST API v1: <APP_URL>/api/v1
 * One catch-all route; dispatching, auth (Bearer isk_) and errors live in lib/api/router.ts so the
 * MCP server can call the exact same handlers in-process.
 */
import { handleApiRequest } from "@/lib/api/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const handle = (req: Request) => handleApiRequest(req);

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
