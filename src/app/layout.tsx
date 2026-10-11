import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./editorial.css";
import "./compact.css";
import "./structured-layout.css";
export const metadata: Metadata = {
  title: "MY OPS · 개인 업무 관제센터",
  description: "PERSONAL과 FRENGLE을 구분하는 개인 업무 운영 OS",
  appleWebApp: { capable: true, title: "MY OPS", statusBarStyle: "default" },
  icons: { apple: "/icons/my-ops-180.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf8f5",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
