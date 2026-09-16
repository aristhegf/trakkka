import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "AssetWatch", template: "%s · AssetWatch" },
  description: "One live map for your devices, pets and vehicles.",
  applicationName: "AssetWatch",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AssetWatch", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f17" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the stored theme before paint to avoid a flash. Falls back to the OS preference.
const themeScript = `(function(){try{var t=localStorage.getItem('aw-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        {/* beforeInteractive: injected into the document head before hydration so there is no theme flash */}
        <Script id="aw-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
