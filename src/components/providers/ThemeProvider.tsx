"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Class-based dark mode (`.dark` on <html>), as beui components expect. Follows the OS until the user picks. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
