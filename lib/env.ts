import "server-only";
import { resolveDatabaseUrl } from "@/lib/db/url";
import { brand } from "@/lib/brand";

function required(name: string, value?: string): string {
  const v = value ?? process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const env = {
  appUrl(): string {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
    if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  },
  databaseUrl: () => required("DATABASE_URL (or POSTGRES_URL)", resolveDatabaseUrl("app") ?? ""),
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)", process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ""),
  resendKey: () => process.env.RESEND_API_KEY || "",
  emailFrom: () => process.env.EMAIL_FROM_ADDRESS || "",
  /** Display name on mail sent without a person behind it (login codes, system mail). */
  emailFromName: () => process.env.EMAIL_FROM_NAME || brand.name,
  supportEmail: () => brand.supportEmail || process.env.EMAIL_FROM_ADDRESS || "",
  tokenPepper: () => required("TOKEN_PEPPER"),
  cronSecret: () => process.env.CRON_SECRET || "",
  /** First OTP login with this email creates the workspace and its owner (only while no owner exists). */
  ownerEmail: () => (process.env.OWNER_EMAIL || "").trim().toLowerCase(),
  workspaceName: () => (process.env.WORKSPACE_NAME || brand.company || "My workspace").trim(),
};
