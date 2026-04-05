import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";
import { getCurrentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  return (
    <>
      <AppHeader mode="admin" showDashboardLink={false} />
      <DashboardPageClient />
    </>
  );
}
