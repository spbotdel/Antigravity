import { redirect } from "next/navigation";

import { AuditLogTable } from "@/components/audit/audit-log-table";
import { TreeNav } from "@/components/layout/tree-nav";
import { getTreeSnapshot, listAudit } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

interface AuditPageProps {
  params: Promise<{ slug: string }>;
}

export default async function AuditPage({ params }: AuditPageProps) {
  const { slug } = await params;
  const snapshot = await getTreeSnapshot(slug);

  if (!snapshot.actor.canReadAudit) {
    redirect(`/tree/${slug}`);
  }

  const entries = await listAudit(snapshot.tree.id);

  return (
    <main className="page-shell workspace-page">
      <section className="section-header workspace-header">
        <div className="workspace-header-main">
          <div className="workspace-meta-row">
            <p className="eyebrow">Журнал владельца</p>
            <span className="workspace-meta-chip">{entries.length} событий</span>
            <span className="workspace-meta-chip">МСК</span>
          </div>
          <h1>{snapshot.tree.title}</h1>
          <p className="muted-copy">История действий по дереву собрана в одну спокойную ленту без технического шума и лишних полей.</p>
        </div>
        <TreeNav
          slug={slug}
          canEdit={snapshot.actor.canEdit}
          canManageMembers={snapshot.actor.canManageMembers}
          canReadAudit={snapshot.actor.canReadAudit}
          canManageSettings={snapshot.actor.canManageSettings}
        />
      </section>
      <AuditLogTable entries={entries} />
    </main>
  );
}
