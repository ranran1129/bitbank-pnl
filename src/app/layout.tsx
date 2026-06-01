import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "bitbank PnL Dashboard",
  description: "bitbank APIを使った現物・信用取引の損益計算ダッシュボード",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
