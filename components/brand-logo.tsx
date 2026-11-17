/* eslint-disable @next/next/no-img-element */
import { brand } from "@/lib/brand";
import { cn } from "@/lib/cn";

/**
 * Header logo. Stock install: Imagine wordmark + serif "Sign". NEXT_PUBLIC_BRAND_LOGO: that image only.
 * Custom NEXT_PUBLIC_BRAND_NAME without a logo: the name as serif text.
 */
export function BrandLogo({ imgClass, textClass }: { imgClass: string; textClass: string }) {
  if (brand.logo) return <img src={brand.logo} alt={brand.name} className={imgClass} />;
  if (!brand.isDefault) return <span className={cn("font-serif leading-none text-ink mt-1", textClass)}>{brand.name}</span>;
  return (
    <>
      <img src="/brand/imagine-logo.svg" alt="Imagine" className={imgClass} />
      <span className={cn("font-serif leading-none text-rose-ink mt-1", textClass)}>Sign</span>
    </>
  );
}

/** Small "Built by Imagine AI" credit. Hidden with NEXT_PUBLIC_SHOW_POWERED_BY=false. */
export function PoweredBy({ className }: { className?: string }) {
  if (!brand.poweredBy) return null;
  return (
    <a href={brand.poweredByUrl} target="_blank" rel="noopener" className={cn("text-muted hover:text-ink underline-offset-2 hover:underline", className)}>
      Built by Imagine AI
    </a>
  );
}
