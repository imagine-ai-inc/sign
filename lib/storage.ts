import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sql, type Db } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto";

const BUCKET = "documents";

export interface FileRow { id: string; workspaceId: string; bucket: string; path: string; filename: string; contentType: string; sizeBytes: number; sha256: string; kind: string }

export async function putObject(path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await supabaseAdmin().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

export async function getObject(path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`storage download failed: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeObject(path: string) {
  await supabaseAdmin().storage.from(BUCKET).remove([path]);
}

export async function createSignedUpload(path: string) {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`signed upload failed: ${error?.message}`);
  return data; // { signedUrl, token, path }
}

export async function storeFile(db: Db, opts: { workspaceId: string; path: string; filename: string; contentType: string; bytes: Uint8Array; kind: string; createdBy?: string | null }): Promise<FileRow> {
  await putObject(opts.path, opts.bytes, opts.contentType);
  const [row] = await db<FileRow[]>`
    insert into sign.files (workspace_id, bucket, path, filename, content_type, size_bytes, sha256, kind, created_by)
    values (${opts.workspaceId}, ${BUCKET}, ${opts.path}, ${opts.filename}, ${opts.contentType}, ${opts.bytes.byteLength}, ${sha256Hex(opts.bytes)}, ${opts.kind}, ${opts.createdBy ?? null})
    on conflict (bucket, path) do update set size_bytes = excluded.size_bytes, sha256 = excluded.sha256, filename = excluded.filename
    returning *`;
  return row;
}

export async function getFile(id: string): Promise<FileRow | null> {
  const [row] = await sql<FileRow[]>`select * from sign.files where id = ${id}`;
  return row ?? null;
}

export async function readFileBytes(id: string): Promise<{ file: FileRow; bytes: Uint8Array }> {
  const file = await getFile(id);
  if (!file) throw new Error("file not found");
  return { file, bytes: await getObject(file.path) };
}
