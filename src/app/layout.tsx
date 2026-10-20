import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import "./editorial.css";
import "./compact.css";
import "./structured-layout.css";
import "./alignment.css";
import "./personal-sheets.css";
import "./overview-refresh.css";
import "./layout-stability.css";
const notoSans = Noto_Sans_KR({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-kr",
});
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
    <html lang="ko" className={notoSans.variable}>
      <body>{children}</body>
    </html>
  );
}
