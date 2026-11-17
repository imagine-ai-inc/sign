"use client";
import { createClient } from "@supabase/supabase-js";

let sb: ReturnType<typeof createClient> | null = null;
function client() {
  if (!sb) sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!, { auth: { persistSession: false } });
  return sb;
}

/** Uploads a PDF straight to storage with a signed URL. Returns the storage path to attach. */
export async function uploadPdf(file: File): Promise<string> {
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error(`${file.name} isn't a PDF. Export it to PDF first.`);
  const res = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, size: file.size }) });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || "Upload failed");
  const { error } = await client().storage.from("documents").uploadToSignedUrl(j.path, j.token, file, { contentType: "application/pdf" });
  if (error) throw new Error(error.message);
  return j.path as string;
}
