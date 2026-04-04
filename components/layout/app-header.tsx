"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

interface AppHeaderProps {
  initialUser: {
    id: string;
    email: string | null;
  } | null;
}

export function AppHeader({ initialUser }: AppHeaderProps) {
  const pathname = usePathname();
  const [user, setUser] = useState(initialUser);

  function normalizeUser(
    value:
      | {
          id: string;
          email: string | null;
        }
      | {
          id: string;
          email?: string | null;
        }
      | null
      | undefined
  ) {
    if (!value) {
      return null;
    }

    return {
      id: value.id,
      email: value.email ?? null
    };
  }

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let active = true;

    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) {
          setUser(normalizeUser(data.user) ?? initialUser ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setUser(initialUser ?? null);
        }
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(normalizeUser(session?.user) ?? initialUser ?? null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [initialUser]);

  return (
    <header className="app-header">
      <Link href="/" className="brandmark">
        <span className="brandmark-seal">AG</span>
        <span>
          <strong>Семейное дерево</strong>
          <small>Система семейной памяти</small>
        </span>
      </Link>

      <div className="header-actions">
        {user ? (
          <>
            <span className="header-user">{user.email}</span>
            {pathname === "/dashboard" ? (
              <span className={buttonVariants({ variant: "secondary", size: "sm" })} aria-current="page">
                Панель
              </span>
            ) : (
              <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Панель
              </Link>
            )}
            <SignOutButton />
          </>
        ) : (
          <>
            <Link href="/auth/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Войти
            </Link>
            <Link href="/auth/register" className={buttonVariants({ size: "sm" })}>
              Создать дерево
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
