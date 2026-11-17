import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "rose" | "link";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-[#2a2827] border border-ink",
  secondary: "bg-white text-ink border border-hairline hover:bg-paper-2",
  ghost: "bg-transparent text-ink hover:bg-paper-2 border border-transparent",
  danger: "bg-bad text-white hover:opacity-90 border border-bad",
  rose: "bg-rose text-ink hover:bg-rose-2 border border-rose-2",
  link: "bg-transparent text-rose-ink hover:underline border border-transparent px-0",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-[15px]",
  icon: "h-9 w-9 justify-center",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = "primary", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center gap-2 rounded-[6px] font-medium transition-colors focus-ring disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});

export function LinkButton({ href, className, variant = "primary", size = "md", children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return (
    <a href={href} className={cn("inline-flex items-center gap-2 rounded-[6px] font-medium transition-colors focus-ring whitespace-nowrap", variants[variant], sizes[size], className)} {...rest}>
      {children}
    </a>
  );
}
