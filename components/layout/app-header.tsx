"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function AppHeader() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let active = true;

    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) {
          setUser(data.user ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="app-header">
      <Link href="/" className="brandmark">
        <span className="brandmark-seal">AG</span>
        <span>
          <strong>Antigravity Family Atlas</strong>
          <small>Система семейной памяти</small>
        </span>
      </Link>

      <div className="header-actions">
        {user ? (
          <>
            <span className="header-user">{user.email}</span>
            <Link href="/dashboard" className="ghost-button">
              Панель
            </Link>
            <SignOutButton />
          </>
        ) : (
          <>
            <Link href="/auth/login" className="ghost-button">
              Войти
            </Link>
            <Link href="/auth/register" className="primary-button">
              Создать дерево
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
