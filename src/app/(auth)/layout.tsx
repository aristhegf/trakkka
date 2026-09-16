import Link from "next/link";
import { Radar } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Radar className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">AssetWatch</span>
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-muted">
          Location data is sensitive. AssetWatch only ever shows assets you registered yourself.
        </p>
      </div>
    </div>
  );
}
