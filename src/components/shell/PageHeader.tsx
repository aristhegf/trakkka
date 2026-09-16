import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageHeader({ title, description, backHref, actions }: { title: string; description?: string; backHref?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {backHref ? (
          <Link href={backHref} className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        ) : null}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}
