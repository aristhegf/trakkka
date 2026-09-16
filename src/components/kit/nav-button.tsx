import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Client-side navigation styled like the beui Button. beui's ButtonLink renders a plain <a>, which would reload the
 * whole app (and drop the realtime connection) on every internal link, so internal links use next/link instead.
 */
const VARIANT = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
  outline: "border border-border bg-transparent text-foreground hover:bg-primary/5",
} as const;

const SIZE = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-5 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
} as const;

export function NavButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: Omit<React.ComponentProps<typeof Link>, "className"> & { variant?: keyof typeof VARIANT; size?: keyof typeof SIZE; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-full font-medium transition-[colors,transform] active:scale-[0.96] [&_svg]:h-4 [&_svg]:w-4",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
