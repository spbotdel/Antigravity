import { redirect } from "next/navigation";

import { TreeNav } from "@/components/layout/tree-nav";
import { BuilderWorkspace } from "@/components/tree/builder-workspace";
import { AppError } from "@/lib/server/errors";
import { getBuilderSnapshot } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

interface BuilderPageProps {
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

export default async function BuilderPage({ params, searchParams }: BuilderPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const shareToken = getSearchParam(resolvedSearchParams.share);
  let snapshot;
  try {
    snapshot = await getBuilderSnapshot(slug, { shareToken });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect(buildViewerHref(slug, shareToken));
    }

    throw error;
  }

  if (!snapshot.actor.canEdit) {
    redirect(buildViewerHref(slug, shareToken));
  }

  return (
    <main className="page-shell workspace-page workspace-page-canvas">
      <section className="section-header workspace-header workspace-header-canvas">
        <div className="workspace-header-main">
        <div className="workspace-meta-row">
          <p className="eyebrow">Конструктор</p>
          <span className="workspace-meta-chip">Редактирование</span>
        </div>
        <h1>{snapshot.tree.title}</h1>
        <p className="muted-copy">Редактируйте людей, связи и медиа прямо рядом со схемой.</p>
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
      <BuilderWorkspace snapshot={snapshot} mediaLoaded={false} />
    </main>
  );
}
