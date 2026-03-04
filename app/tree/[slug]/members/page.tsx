import { redirect } from "next/navigation";

import { TreeNav } from "@/components/layout/tree-nav";
import { MemberManagementPanel } from "@/components/members/member-management-panel";
import { getTreeSnapshot, listInvites, listMemberships } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

interface MembersPageProps {
  params: Promise<{ slug: string }>;
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { slug } = await params;
  const snapshot = await getTreeSnapshot(slug);

  if (!snapshot.actor.canManageMembers) {
    redirect(`/tree/${slug}`);
  }

  const memberships = await listMemberships(snapshot.tree.id);
  const invites = await listInvites(snapshot.tree.id);
  const activeMemberships = memberships.filter((membership) => membership.status === "active");
  const pendingInvites = invites.filter((invite) => !invite.accepted_at);

  return (
    <main className="page-shell workspace-page">
      <section className="section-header workspace-header">
        <div className="workspace-header-main">
          <div className="workspace-meta-row">
            <p className="eyebrow">Участники</p>
            <span className="workspace-meta-chip">{activeMemberships.length} активных</span>
            <span className="workspace-meta-chip">{pendingInvites.length} ждут ответа</span>
          </div>
          <h1>{snapshot.tree.title}</h1>
          <p className="muted-copy">Роли, приглашения и действующий доступ собраны в одном коротком экране без тяжелой админки.</p>
        </div>
        <TreeNav
          slug={slug}
          canEdit={snapshot.actor.canEdit}
          canManageMembers={snapshot.actor.canManageMembers}
          canReadAudit={snapshot.actor.canReadAudit}
          canManageSettings={snapshot.actor.canManageSettings}
        />
      </section>
      <MemberManagementPanel tree={snapshot.tree} memberships={memberships} invites={invites} />
    </main>
  );
}
