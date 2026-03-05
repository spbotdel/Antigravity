import { redirect } from "next/navigation";

import { TreeNav } from "@/components/layout/tree-nav";
import { BuilderWorkspace } from "@/components/tree/builder-workspace";
import { getBuilderSnapshot } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

interface BuilderPageProps {
  params: Promise<{ slug: string }>;
}

export default async function BuilderPage({ params }: BuilderPageProps) {
  const { slug } = await params;
  const snapshot = await getBuilderSnapshot(slug);

  if (!snapshot.actor.canEdit) {
    redirect(`/tree/${slug}`);
  }

  return (
    <main className="page-shell workspace-page">
      <section className="section-header workspace-header">
        <div className="workspace-header-main">
        <div className="workspace-meta-row">
          <p className="eyebrow">Конструктор</p>
          <span className="workspace-meta-chip">Редактирование</span>
        </div>
        <h1>{snapshot.tree.title}</h1>
        <p className="muted-copy">Люди, связи и медиа редактируются рядом со схемой. Выберите ветку на canvas, а детали уточняйте справа.</p>
      </div>
        <TreeNav
          slug={slug}
          canEdit={snapshot.actor.canEdit}
          canManageMembers={snapshot.actor.canManageMembers}
          canReadAudit={snapshot.actor.canReadAudit}
          canManageSettings={snapshot.actor.canManageSettings}
        />
      </section>
      <BuilderWorkspace snapshot={snapshot} mediaLoaded={false} />
    </main>
  );
}
