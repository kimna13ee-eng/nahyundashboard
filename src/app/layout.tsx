import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
const notoSans = Noto_Sans_KR({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-kr",
});
export const metadata: Metadata = {
  title: "나의 플래너 · 콘텐츠와 요가",
  description:
    "콘텐츠 기획·원고·성과와 주간 요가 영상을 한곳에서 확인하는 개인 플래너",
  appleWebApp: {
    capable: true,
    title: "나의 플래너",
    statusBarStyle: "default",
  },
  icons: { apple: "/icons/my-ops-180.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFF8F1",
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
