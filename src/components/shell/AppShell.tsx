"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Fence, LayoutDashboard, LogOut, Moon, Radar, Settings, ShieldCheck, Sun, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme } from "./ThemeProvider";
import { useAssetStore } from "@/components/store/AssetStore";
import { signOut } from "@/lib/auth/actions";

const NAV = [
  { href: "/dashboard", label: "Map", icon: LayoutDashboard },
  { href: "/geofences", label: "Places", icon: Fence },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, isAdmin, displayName }: { children: React.ReactNode; isAdmin: boolean; displayName: string | null }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { connected, alerts } = useAssetStore();
  const openAlerts = alerts.filter((a) => !a.acknowledged_at && !a.resolved_at).length;
  const nav = isAdmin ? [...NAV, { href: "/admin", label: "Admin", icon: ShieldCheck }] : NAV;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Desktop rail */}
      <aside className="hidden w-16 shrink-0 flex-col items-center border-r border-border bg-surface py-3 md:flex">
        <Link href="/dashboard" className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-label="AssetWatch">
          <Radar className="h-5 w-5" />
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                className={cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground",
                  active && "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent",
                )}
              >
                <Icon className="h-5 w-5" />
                {href === "/alerts" && openAlerts > 0 ? (
                  <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {openAlerts > 99 ? "99+" : openAlerts}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col items-center gap-1">
          <span title={connected ? "Realtime connected" : "Realtime reconnecting"} className={cn("flex h-9 w-9 items-center justify-center", connected ? "text-success" : "text-muted")}>
            {connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          </span>
          <button type="button" onClick={toggle} title="Toggle theme" aria-label="Toggle theme" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <form action={signOut}>
            <button type="submit" title={`Sign out${displayName ? ` (${displayName})` : ""}`} aria-label="Sign out" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">{children}</div>
        {/* Mobile bottom nav */}
        <nav className="flex shrink-0 items-stretch justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted", active && "text-accent")}>
                <Icon className="h-5 w-5" />
                {label}
                {href === "/alerts" && openAlerts > 0 ? (
                  <span className="absolute left-1/2 top-1 ml-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">{openAlerts > 99 ? "99+" : openAlerts}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
