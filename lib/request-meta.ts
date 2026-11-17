export interface RequestMeta { ip: string | null; userAgent: string | null; geo: { city?: string; region?: string; country?: string } | null }

export function metaFromHeaders(h: Headers): RequestMeta {
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : null) || h.get("x-real-ip") || null;
  const city = h.get("x-vercel-ip-city");
  const region = h.get("x-vercel-ip-country-region");
  const country = h.get("x-vercel-ip-country");
  const geo = city || region || country ? { city: city ? decodeURIComponent(city) : undefined, region: region || undefined, country: country || undefined } : null;
  return { ip, userAgent: h.get("user-agent"), geo };
}

export function geoLabel(geo: RequestMeta["geo"]): string | null {
  if (!geo) return null;
  return [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || null;
}
