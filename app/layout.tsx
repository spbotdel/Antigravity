import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/app-header";

import "./globals.css";

export const metadata: Metadata = {
  title: "Antigravity Family Atlas",
  description: "Семейное дерево с ролями, приглашениями, фотографиями и гибкой видимостью по ссылке."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <div className="page-frame">
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
