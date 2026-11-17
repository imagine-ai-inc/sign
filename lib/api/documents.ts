import "server-only";
import { sql } from "@/lib/db";
import { readFileBytes } from "@/lib/storage";
import type { AppUser } from "@/lib/types";
import { ApiError } from "@/lib/api/errors";
import { decodeBase64Pdf, isFetchableUrl, looksLikePdf } from "@/lib/api/util";
import type { DocumentBody } from "@/lib/api/schemas";

const MAX_BYTES = 25 * 1024 * 1024;

async function fetchPdf(raw: string, index: number): Promise<{ bytes: Uint8Array; name: string }> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    if (!isFetchableUrl(url)) throw new ApiError("invalid_document_url", `documents[${index}].url must be a public https URL`, 400);
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "ImagineSign/1.0 (self-hosted; +https://github.com/imagine-ai-inc/sign)", Accept: "application/pdf,*/*" } });
    } catch (e) {
      throw new ApiError("document_fetch_failed", `Couldn't download documents[${index}].url: ${e instanceof Error ? e.message : "network error"}`, 422);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    if (!res.ok) throw new ApiError("document_fetch_failed", `documents[${index}].url returned HTTP ${res.status}`, 422);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) throw new ApiError("pdf_too_large", `documents[${index}] is larger than 25 MB`, 413);
    const reader = res.body?.getReader();
    if (!reader) throw new ApiError("document_fetch_failed", `documents[${index}].url returned no body`, 422);
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new ApiError("pdf_too_large", `documents[${index}] is larger than 25 MB`, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(Buffer.concat(chunks));
    const fromPath = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return { bytes, name: fromPath || "Document.pdf" };
  }
  throw new ApiError("document_fetch_failed", `documents[${index}].url redirected too many times`, 422);
}

/** Resolves one API document input (base64, https url, or fileId in the caller's workspace) to PDF bytes. */
export async function loadDocumentInput(user: AppUser, d: DocumentBody, index: number): Promise<{ name: string; bytes: Uint8Array }> {
  let bytes: Uint8Array;
  let name = d.name ?? "";
  if (d.base64) {
    try {
      bytes = decodeBase64Pdf(d.base64);
    } catch {
      throw new ApiError("invalid_document", `documents[${index}].base64 isn't valid base64`, 400);
    }
  } else if (d.url) {
    const got = await fetchPdf(d.url, index);
    bytes = got.bytes;
    name ||= got.name;
  } else {
    const [file] = await sql<{ id: string; workspaceId: string; filename: string }[]>`select id, workspace_id, filename from sign.files where id = ${d.fileId!}`;
    if (!file || file.workspaceId !== user.workspaceId) throw new ApiError("file_not_found", `documents[${index}].fileId wasn't found in your workspace`, 404);
    bytes = (await readFileBytes(file.id)).bytes;
    name ||= file.filename;
  }
  if (bytes.byteLength > MAX_BYTES) throw new ApiError("pdf_too_large", `documents[${index}] is larger than 25 MB`, 413);
  if (!looksLikePdf(bytes)) throw new ApiError("pdf_invalid", `documents[${index}] isn't a PDF`, 400);
  return { name: name || `Document ${index + 1}.pdf`, bytes };
}
