import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./setup-walkthrough.css";
import "./mobile.css";
import "./deployment-diagnostics.css";
import "./studio-workspace.css";
import "./strategy.css";
import "./media-editor.css";
import "./workspace-design.css";
import "./platform-design.css";
import "./legal.css";

export const metadata: Metadata = {
  title: "Tổng quan · TubeFlow",
  description: "Không gian dành cho nhà sáng tạo. Sắp xếp ý tưởng, lên lịch, biên tập và phát triển kênh YouTube cùng TubeFlow.",
  applicationName: "TubeFlow",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TubeFlow", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8fc",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="vi"><head><link rel="stylesheet" href="/fonts/font-faces.css" /></head><body>{children}</body></html>;
}
