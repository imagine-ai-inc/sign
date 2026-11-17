import { VerifyDropzone } from "./verify-dropzone";
import { BrandLogo } from "@/components/brand-logo";
import { brand } from "@/lib/brand";

export const metadata = { title: "Verify a document" };

export default function VerifyPage() {
  return (
    <main className="min-h-screen">
      <header className="h-16 bg-white border-b border-hairline px-6 flex items-center gap-1.5">
        <BrandLogo imgClass="h-[26px]" textClass="text-[22px]" />
      </header>
      <div className="max-w-[640px] mx-auto px-6 py-12">
        <h1 className="font-serif text-[36px] leading-tight">Verify a document</h1>
        <p className="text-sm text-ink-2 mt-2">Drop a PDF you received from {brand.name}. We compute its fingerprint in your browser (the file never leaves your device) and check it against the completed envelope on record.</p>
        <VerifyDropzone />
      </div>
    </main>
  );
}
