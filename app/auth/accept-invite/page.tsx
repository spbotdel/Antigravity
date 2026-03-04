import { Suspense } from "react";

import { InviteAcceptanceCard } from "@/components/auth/invite-acceptance-card";

export default function AcceptInvitePage() {
  return (
    <main className="page-shell narrow-shell">
      <Suspense fallback={<section className="auth-card">Загружаю приглашение...</section>}>
        <InviteAcceptanceCard />
      </Suspense>
    </main>
  );
}
