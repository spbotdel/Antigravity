"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { translateAuthError } from "@/lib/auth-error";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="stack-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
          const form = new FormData(event.currentTarget);
          const supabase = createBrowserSupabaseClient();
          const { error: authError } = await supabase.auth.signInWithPassword({
            email: String(form.get("email") || ""),
            password: String(form.get("password") || "")
          });

          setLoading(false);

          if (authError) {
            setError(translateAuthError(authError.message));
            return;
          }

          router.push(searchParams.get("next") || "/dashboard");
          router.refresh();
        } catch (submitError) {
          setLoading(false);
          setError(translateAuthError(submitError instanceof Error ? submitError.message : "fetch failed"));
        }
      }}
    >
      <label>
        Почта
        <input name="email" type="email" required placeholder="you@example.com" />
      </label>
      <label>
        Пароль
        <input name="password" type="password" required minLength={8} placeholder="********" />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "Входим..." : "Войти"}
      </button>
    </form>
  );
}
