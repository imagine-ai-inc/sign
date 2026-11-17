import "server-only";
import { headers } from "next/headers";
import { metaFromHeaders, type RequestMeta } from "@/lib/request-meta";

export { metaFromHeaders, geoLabel } from "@/lib/request-meta";
export type { RequestMeta } from "@/lib/request-meta";

export async function requestMeta(): Promise<RequestMeta> {
  return metaFromHeaders(await headers());
}
