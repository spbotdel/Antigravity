import { Suspense } from "react";

import { InviteAcceptanceCard } from "@/components/auth/invite-acceptance-card";
import { Card } from "@/components/ui/card";

export default function AcceptInvitePage() {
  return (
    <main className="page-shell narrow-shell">
      <Suspense fallback={<Card className="auth-card"><p className="auth-card-support">Загружаю приглашение...</p></Card>}>
        <InviteAcceptanceCard />
      </Suspense>
    </main>
  );
}
