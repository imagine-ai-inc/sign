import { LoginForm } from "./login-form";
import { BrandLogo, PoweredBy } from "@/components/brand-logo";
import { brand } from "@/lib/brand";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[420px]">
          <div className="flex items-center justify-center gap-2 mb-8">
            <BrandLogo imgClass="h-8" textClass="text-[26px]" />
          </div>
          <div className="bg-card border border-hairline rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8">
            <LoginForm next={next || "/"} />
          </div>
          <p className="text-center text-xs text-muted mt-6">{brand.company ? `${brand.name} is for the ${brand.company} team.` : `${brand.name} is invite only.`} Signing a document someone sent you? Use the link in your email.</p>
          <p className="text-center text-xs mt-3"><PoweredBy /></p>
        </div>
      </div>
    </main>
  );
}
