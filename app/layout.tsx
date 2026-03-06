import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";

import "./globals.css";

export const metadata: Metadata = {
  title: "Antigravity Family Atlas",
  description: "Семейное дерево с ролями, приглашениями, фотографиями и гибкой видимостью по ссылке."
};

function getInitialHeaderUser() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const userId = process.env.DEV_IMPERSONATE_USER_ID?.trim();
  if (!userId) {
    return null;
  }

  return {
    id: userId,
    email: process.env.DEV_IMPERSONATE_USER_EMAIL?.trim() || "dev-impersonated@localhost"
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const initialUser = getInitialHeaderUser();
  return (
    <html lang="ru">
      <body className="page-frame">
        <AppHeader initialUser={initialUser} />
        {children}
      </body>
    </html>
  );
}
