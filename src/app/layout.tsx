import type { Metadata } from "next";
import "./globals.css";
import "./editorial.css";
export const metadata: Metadata = {title:"MY OPS · 개인 업무 관제센터",description:"PERSONAL과 FRENGLE을 구분하는 개인 업무 운영 OS"};
export default function RootLayout({children}: Readonly<{children:React.ReactNode}>) { return <html lang="ko"><body>{children}</body></html>; }
