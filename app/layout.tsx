import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Antigravity Family Atlas",
  description: "Семейное дерево с ролями, приглашениями, фотографиями и гибкой видимостью по ссылке."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="page-frame">
        {children}
      </body>
    </html>
  );
}
