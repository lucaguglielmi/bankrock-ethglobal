import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientProviders from "@/components/client-providers";
import { Header } from "@/components/header";
import { Toaster } from "sonner";
import { VersionCheck } from "@/components/version-check";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-white text-black selection:bg-black selection:text-white">
        <ClientProviders>
          <Header />
          {children}
          <Toaster 
            position="bottom-right" 
            toastOptions={{
              style: {
                background: "black",
                color: "white",
                border: "1px solid #333",
                fontFamily: "var(--font-geist-sans)",
              }
            }}
          />
        </ClientProviders>
        <VersionCheck />
      </body>
    </html>
  );
}
