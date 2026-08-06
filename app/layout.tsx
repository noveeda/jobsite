import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "채용공고 허브",
  description: "흩어진 채용공고를 한곳에서 관리합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
