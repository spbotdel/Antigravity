import type { Metadata } from "next";
import { Forum, Onest } from "next/font/google";

import "./globals.css";

const forum = Forum({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-tree-overlay-title"
});

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-tree-overlay-meta"
});

export const metadata: Metadata = {
  title: "Antigravity Family Atlas",
  description: "Семейное дерево с ролями, приглашениями, фотографиями и гибкой видимостью по ссылке.",
  icons: {
    icon: "/brandmarks/family-tree-mark.png",
    apple: "/brandmarks/family-tree-mark.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${forum.variable} ${onest.variable} page-frame`}>
        {children}
      </body>
    </html>
  );
}
