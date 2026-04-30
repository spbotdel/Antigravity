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
  title: "Семейное дерево",
  description: "История семьи, собранная в одном месте",
  icons: {
    icon: "/brandmarks/family-tree-mark.png",
    apple: "/brandmarks/family-tree-mark.png"
  },
  openGraph: {
    title: "Семейное дерево",
    description: "История семьи, собранная в одном месте",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Семейное дерево",
    description: "История семьи, собранная в одном месте"
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
