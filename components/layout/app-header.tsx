"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import type { HeaderMode } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  mode: HeaderMode;
  showDashboardLink: boolean;
}

export function AppHeader({ mode, showDashboardLink }: AppHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <header className={cn("app-header", isScrolled && "is-scrolled")} data-mode={mode}>
      <Link href="/" className="brandmark">
        <span className="brandmark-seal" aria-hidden="true">
          <img src="/brandmarks/family-tree-mark.png" alt="" className="brandmark-icon-image" />
        </span>
        <strong>Семейное дерево</strong>
      </Link>

      {mode === "guest" ? null : (
        <div className="header-actions">
          {mode === "admin" && showDashboardLink ? (
            <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Панель
            </Link>
          ) : null}
          <SignOutButton />
        </div>
      )}
    </header>
  );
}
