"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Map as MapIcon, MapPin, Settings, ShieldCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { Tooltip } from "@/components/motion/tooltip";
import { useAssetStore } from "@/components/store/AssetStore";
import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { ConnectionBanner } from "@/components/kit/connection";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Map", icon: MapIcon },
  { href: "/geofences", label: "Places", icon: MapPin },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

function activeHref(pathname: string, items: NavItem[]): string {
  if (pathname.startsWith("/assets")) return "/dashboard";
  return items.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))?.href ?? "/dashboard";
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex min-h-11 items-center gap-2", className)} aria-label="Trakkka home">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">Trakkka</span>
    </Link>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid h-8 w-8 place-items-center rounded-xl bg-foreground text-background", className)}>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
        <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
        <circle cx="12" cy="10" r="2.2" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function AppShell({ children, isAdmin, displayName }: { children: React.ReactNode; isAdmin: boolean; displayName: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { connected, alerts } = useAssetStore();
  const openAlerts = alerts.filter((a) => !a.acknowledged_at && !a.resolved_at).length;
  const items = isAdmin ? [...NAV, { href: "/admin", label: "Admin", icon: ShieldCheck }] : NAV;
  const current = activeHref(pathname, items);
  const onMap = pathname === "/dashboard";

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      {/* Desktop / tablet top bar */}
      <header className="hidden h-16 shrink-0 items-center gap-6 border-b border-border bg-background/80 px-6 backdrop-blur md:flex">
        <Logo />
        <Tabs value={current} onValueChange={(v) => router.push(v)} variant="pill">
          <TabsList className="bg-muted">
            {items.map(({ href, label, icon: Icon }) => (
              <TabsTrigger key={href} value={href} className="gap-1.5 px-4">
                <Icon className="h-4 w-4" />
                {label}
                {href === "/alerts" && openAlerts > 0 ? (
                  <span className="ml-1 min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] font-semibold leading-5 text-destructive-foreground">{openAlerts > 99 ? "99+" : openAlerts}</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip content={connected ? "Live updates connected" : "Reconnecting to live updates…"} side="bottom">
            <span tabIndex={0} className="flex h-9 items-center gap-2 rounded-full px-3 text-xs text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", connected ? "bg-fresh-live" : "animate-pulse bg-fresh-recent")} />
              {connected ? "Live updates on" : "Connecting"}
            </span>
          </Tooltip>
          <ThemeToggle variant="circle" start="top-right" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" />
          <form action={signOut}>
            <Tooltip content={`Sign out${displayName ? ` (${displayName})` : ""}`} side="bottom">
              <button type="submit" aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <LogOut className="h-4 w-4" />
              </button>
            </Tooltip>
          </form>
        </div>
      </header>

      {/* Phone: warn when locations may be stale. The map shows its own banner under the search pill. */}
      {!onMap ? <ConnectionBanner className="mx-3 mt-[max(0.5rem,env(safe-area-inset-top))] shrink-0 md:hidden" /> : null}
      <main className="relative min-h-0 flex-1">{children}</main>

      {/* Phone bottom navigation: beui pill tabs, icon over label, 48px touch targets. Floats over the map. */}
      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:hidden",
          onMap ? "pointer-events-none" : "border-t border-border bg-background/90 backdrop-blur",
        )}
      >
        <Tabs value={current} onValueChange={(v) => router.push(v)} variant="pill" className="pointer-events-auto">
          <TabsList className="flex w-full justify-between rounded-[22px] border border-border bg-card p-1.5 shadow-lg">
            {NAV.map(({ href, label, icon: Icon }) => (
              <TabsTrigger key={href} value={href} className="relative flex h-12 w-full flex-col gap-0.5 rounded-[18px] px-2 text-[11px]">
                <Icon className="h-5 w-5" />
                {label}
                {href === "/alerts" && openAlerts > 0 ? (
                  <span className="absolute right-2 top-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 text-destructive-foreground">{openAlerts > 9 ? "9+" : openAlerts}</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </nav>
    </div>
  );
}
