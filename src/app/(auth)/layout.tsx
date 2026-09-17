import { Logo } from "@/components/shell/AppShell";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-8 md:pt-6">
        <Logo />
        <ThemeToggle variant="circle" start="top-right" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          {children}
          <p className="mt-8 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Your locations are private. Trakkka only shows assets you add yourself.
          </p>
        </div>
      </main>
    </div>
  );
}
