import { redirect } from "next/navigation";

import { TreeNav } from "@/components/layout/tree-nav";
import { MemberManagementPanel } from "@/components/members/member-management-panel";
import { getTreeSnapshot, listInvites, listMemberships, listShareLinks } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

interface MembersPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function getSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function buildViewerHref(slug: string, shareToken?: string | null) {
  if (!shareToken) {
    return `/tree/${slug}`;
  }

  return `/tree/${slug}?share=${encodeURIComponent(shareToken)}`;
}

export default async function MembersPage({ params, searchParams }: MembersPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const shareToken = getSearchParam(resolvedSearchParams.share);
  const snapshot = await getTreeSnapshot(slug, { shareToken });

  if (!snapshot.actor.canManageMembers) {
    redirect(buildViewerHref(slug, shareToken));
  }

  const memberships = await listMemberships(snapshot.tree.id);
  const invites = await listInvites(snapshot.tree.id);
  const shareLinks = await listShareLinks(snapshot.tree.id);
  const activeMemberships = memberships.filter((membership) => membership.status === "active");
  const pendingInvites = invites.filter((invite) => !invite.accepted_at);
  const activeShareLinks = shareLinks.filter((shareLink) => !shareLink.revoked_at && new Date(shareLink.expires_at).getTime() >= Date.now());

  return (
    <main className="page-shell workspace-page">
      <section className="section-header workspace-header">
        <div className="workspace-header-main">
          <div className="workspace-meta-row">
            <p className="eyebrow">Участники</p>
            <span className="workspace-meta-chip">{activeMemberships.length} активных</span>
            <span className="workspace-meta-chip">{pendingInvites.length} ждут ответа</span>
            <span className="workspace-meta-chip">{activeShareLinks.length} семейных ссылок</span>
          </div>
          <h1>{snapshot.tree.title}</h1>
          <p className="muted-copy">Роли, приглашения и действующий доступ собраны в одном коротком экране без тяжелой админки.</p>
        </div>
        <TreeNav
          slug={slug}
          shareToken={shareToken}
          canEdit={snapshot.actor.canEdit}
          canManageMembers={snapshot.actor.canManageMembers}
          canReadAudit={snapshot.actor.canReadAudit}
          canManageSettings={snapshot.actor.canManageSettings}
        />
      </section>
      <MemberManagementPanel tree={snapshot.tree} memberships={memberships} invites={invites} shareLinks={shareLinks} />
    </main>
  );
}
