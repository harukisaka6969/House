import type { Metadata, Viewport } from "next";
import { Zen_Old_Mincho, IBM_Plex_Sans_JP, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const zenOldMincho = Zen_Old_Mincho({
  variable: "--font-heading",
  weight: ["700", "900"],
  subsets: ["latin"],
  display: "swap",
});

const plexSansJp = IBM_Plex_Sans_JP({
  variable: "--font-body",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-num",
  weight: ["500", "600"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "坂家 家計フローダッシュボード",
  description: "坂家の家計フローダッシュボード",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "家計フロー",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101418",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${zenOldMincho.variable} ${plexSansJp.variable} ${plexMono.variable}`}
    >
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
