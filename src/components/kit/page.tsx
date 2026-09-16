import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Scrollable page body with room for the phone bottom nav and the notch. */
export function Page({ children, className, wide = false }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className={cn("mx-auto w-full px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] md:px-8 md:pb-12 md:pt-8", wide ? "max-w-6xl" : "max-w-2xl", className)}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, description, backHref, backLabel = "Back", actions }: { title: string; description?: string; backHref?: string; backLabel?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-6">
      {backHref ? (
        <Link href={backHref} className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-0.5 rounded-full pr-3 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> {backLabel}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Section({ title, description, children, className, action }: { title?: string; description?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("rounded-3xl border border-border bg-card p-4 md:p-5", className)}>
      {title ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Label + value pair for facts about an asset. */
export function Fact({ label, value, detail, className }: { label: string; value: React.ReactNode; detail?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-muted/60 px-3.5 py-3", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
      {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-6 py-10 text-center">
      {icon ? <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground [&_svg]:h-6 [&_svg]:w-6">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
