"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { translateAuthError } from "@/lib/auth-error";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
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
      </Button>
      {error ? <p className="form-error">{error}</p> : null}
    </>
  );
}
