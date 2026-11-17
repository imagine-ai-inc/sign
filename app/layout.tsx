import { brand } from "@/lib/brand";
import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument-serif", display: "swap" });

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f4f1ef" };

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s | ${brand.name}` },
  description: brand.company ? `${brand.company} e-signature` : "E-signature",
  icons: { icon: brand.mark },
  robots: { index: false, follow: false },
};

/** Optional accent overrides (BRAND_ACCENT_COLOR = highlights/tags, BRAND_ACCENT_INK = small accents/links). Hex only. */
function accentCss(): string {
  const hex = (v?: string) => (v && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : "");
  const rules = [hex(process.env.BRAND_ACCENT_COLOR) && `--rose:${hex(process.env.BRAND_ACCENT_COLOR)}`, hex(process.env.BRAND_ACCENT_INK) && `--rose-ink:${hex(process.env.BRAND_ACCENT_INK)}`].filter(Boolean);
  return rules.length ? `:root{${rules.join(";")}}` : "";
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const accent = accentCss();
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      {accent ? <head><style>{accent}</style></head> : null}
      <body className="min-h-full">{children}</body>
    </html>
  );
}
