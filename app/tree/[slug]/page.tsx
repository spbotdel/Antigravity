import { TreeNav } from "@/components/layout/tree-nav";
import { TreeViewerClient } from "@/components/tree/tree-viewer-client";
import { AppError } from "@/lib/server/errors";
import { getTreeSnapshot } from "@/lib/server/repository";
import { formatTreeVisibility } from "@/lib/ui-text";

export const dynamic = "force-dynamic";

interface TreePageProps {
  params: Promise<{ slug: string }>;
}

export default async function TreePage({ params }: TreePageProps) {
  const { slug } = await params;

  try {
    const snapshot = await getTreeSnapshot(slug);

    return (
      <main className="page-shell workspace-page">
        <section className="section-header workspace-header">
          <div className="workspace-header-main">
            <div className="workspace-meta-row">
              <p className="eyebrow">{formatTreeVisibility(snapshot.tree.visibility)} дерево</p>
              <span className="workspace-meta-chip">{snapshot.people.length} чел.</span>
            </div>
            <h1>{snapshot.tree.title}</h1>
            <p className="muted-copy">{snapshot.tree.description || "Описание пока не добавлено."}</p>
          </div>
          <TreeNav
            slug={slug}
            canEdit={snapshot.actor.canEdit}
            canManageMembers={snapshot.actor.canManageMembers}
            canReadAudit={snapshot.actor.canReadAudit}
            canManageSettings={snapshot.actor.canManageSettings}
          />
        </section>
        <TreeViewerClient snapshot={snapshot} />
      </main>
    );
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Не удалось загрузить семейное дерево.";
    return (
      <main className="page-shell narrow-shell">
        <section className="auth-card">
          <p className="eyebrow">Проблема с доступом</p>
          <h1>Дерево недоступно</h1>
          <p className="form-error">{message}</p>
        </section>
      </main>
    );
  }
}
