/**
 * Self-host branding. Everything here is read from NEXT_PUBLIC_* env vars so it works in
 * server and client components alike (Next inlines them at build time; redeploy after changing).
 * Defaults keep the stock "Imagine Sign" look.
 */
const str = (v: string | undefined) => (v ?? "").trim();
const off = (v: string | undefined) => /^(0|false|off|no)$/i.test(str(v));

const DEFAULT_NAME = "Imagine Sign";
const name = str(process.env.NEXT_PUBLIC_BRAND_NAME) || DEFAULT_NAME;
const company = str(process.env.NEXT_PUBLIC_COMPANY_NAME);

function stampLabelFor(n: string) {
  return /sign$/i.test(n) ? `${n}ed by:` : `${n} signed by:`;
}

export const brand = {
  /** Product name shown in the UI, emails, PDFs ("Imagine Sign"). */
  name,
  /** True when the deployer kept the stock Imagine Sign name and logo. */
  isDefault: name === DEFAULT_NAME && !str(process.env.NEXT_PUBLIC_BRAND_LOGO),
  /** Legal name of the organization running this instance ("Acme Inc."). Empty = not shown. */
  company,
  /** Optional logo (URL or /public path) for the app header. Empty = stock logo or the brand name as text. */
  logo: str(process.env.NEXT_PUBLIC_BRAND_LOGO),
  /** Optional PNG logo for emails (absolute URL or /public path, ~448x140). */
  emailLogo: str(process.env.NEXT_PUBLIC_BRAND_EMAIL_LOGO),
  /** Favicon / small mark. */
  mark: str(process.env.NEXT_PUBLIC_BRAND_MARK) || "/brand/imagine-mark.svg",
  /** Label above signatures on the page and in the PDF ("Imagine Signed by:"). */
  stampLabel: str(process.env.NEXT_PUBLIC_STAMP_LABEL) || stampLabelFor(name),
  /** Label inside initials stamps ("IS"). */
  initialsLabel: name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 3),
  /** Small "Built by Imagine AI" credit. Set NEXT_PUBLIC_SHOW_POWERED_BY=false to hide it. */
  poweredBy: !off(process.env.NEXT_PUBLIC_SHOW_POWERED_BY),
  poweredByUrl: "https://useimagine.ai",
  /** Support / contact address shown in API errors and docs. */
  supportEmail: str(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
};

/** "Imagine Sign, the e-signature service of Acme Inc." or just the product name. */
export function serviceLine(): string {
  return brand.company ? `${brand.name}, the e-signature service of ${brand.company}` : brand.name;
}

/** Host of the public app URL, for PDF footers etc. Server-side only (APP_URL is not public). */
export function appHost(): string {
  const raw = str(process.env.APP_URL) || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  try { return raw ? new URL(raw).host : ""; } catch { return ""; }
}
