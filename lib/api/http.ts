import { env } from "@/lib/env";
import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/services/access";
import { ApiError } from "@/lib/api/errors";

export { ApiError } from "@/lib/api/errors";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

export function errorJson(code: string, message: string, status: number, details?: Record<string, unknown>, headers: Record<string, string> = {}) {
  return json({ error: { code, message, ...(details ? { details } : {}) } }, status, headers);
}

/** Maps anything thrown by a handler or a service to the public error shape `{ error: { code, message } }`. */
export function toErrorResponse(e: unknown) {
  if (e instanceof ApiError) return errorJson(e.code, e.message, e.status, e.details, e.headers);
  if (e instanceof AppError) return errorJson(e.code, e.message, e.status);
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    const path = issue?.path?.length ? issue.path.join(".") : "body";
    return errorJson("invalid_request", `${path}: ${issue?.message ?? "invalid"}`, 400, { issues: e.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  console.error("[api/v1] unhandled", e);
  return errorJson("internal_error", `Something went wrong on our side. Try again${env.supportEmail() ? `, and contact ${env.supportEmail()} if it keeps happening` : ""}.`, 500);
}

export async function readJson(req: Request): Promise<unknown> {
  const type = req.headers.get("content-type") || "";
  const text = await req.text();
  if (!text.trim()) return {};
  if (type && !type.includes("json")) throw new ApiError("unsupported_media_type", "Send a JSON body with Content-Type: application/json", 415);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("invalid_json", "The request body isn't valid JSON", 400);
  }
}

export function pdfResponse(bytes: Uint8Array, filename: string, download: boolean) {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/["\\\r\n]/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
