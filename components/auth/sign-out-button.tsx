"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { translateAuthError } from "@/lib/auth-error";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        className="ghost-button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);

          try {
            const supabase = createBrowserSupabaseClient();
            await supabase.auth.signOut();
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/");
            router.refresh();
          } catch (submitError) {
            setLoading(false);
            setError(translateAuthError(submitError instanceof Error ? submitError.message : "fetch failed"));
          }
        }}
      >
        {loading ? "Выходим..." : "Выйти"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </>
  );
}
