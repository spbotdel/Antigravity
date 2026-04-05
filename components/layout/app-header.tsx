import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import type { HeaderMode } from "@/lib/permissions";

interface AppHeaderProps {
  mode: HeaderMode;
  showDashboardLink: boolean;
}

export function AppHeader({ mode, showDashboardLink }: AppHeaderProps) {
  return (
    <header className="app-header" data-mode={mode}>
      <Link href="/" className="brandmark">
        <span className="brandmark-seal" aria-hidden="true">AG</span>
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
