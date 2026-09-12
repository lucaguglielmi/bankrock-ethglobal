import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import ClientProviders from "@/components/client-providers";
import { Header } from "@/components/header";
import { DemoBanner } from "@/components/ui/demo-banner";
import { BottomDock } from "@/components/ui/bottom-dock";
import { VersionCheck } from "@/components/version-check";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "Bank Rock | Tangible DeFi",
  description: "A physical interface to a self-custodial liquidity account.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bank Rock",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col font-sans bg-white text-ink selection:bg-black selection:text-white">
        <ClientProviders>
          <DemoBanner />
          <Header />
          {children}
        </ClientProviders>
        <BottomDock />
        <Toaster position="bottom-center" offset="var(--dock-h)" />
        <VersionCheck />
      </body>
    </html>
  );
}
