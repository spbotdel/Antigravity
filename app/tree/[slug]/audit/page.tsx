import { redirect } from "next/navigation";

import { AuditLogTable } from "@/components/audit/audit-log-table";
import { TreeNav } from "@/components/layout/tree-nav";
import { AppError } from "@/lib/server/errors";
import { getTreeAuditPageContext, listAudit } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

interface AuditPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function getSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function getPositiveInteger(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function buildViewerHref(slug: string, shareToken?: string | null) {
  if (!shareToken) {
    return `/tree/${slug}`;
  }

  return `/tree/${slug}?share=${encodeURIComponent(shareToken)}`;
}

export default async function AuditPage({ params, searchParams }: AuditPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const shareToken = getSearchParam(resolvedSearchParams.share);
  const page = getPositiveInteger(getSearchParam(resolvedSearchParams.page), 1);
  let treeContext;
  try {
    treeContext = await getTreeAuditPageContext(slug, { shareToken });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect(buildViewerHref(slug, shareToken));
    }

    throw error;
  }

  if (!treeContext.actor.canReadAudit) {
    redirect(buildViewerHref(slug, shareToken));
  }

  const audit = await listAudit(treeContext.tree.id, { page, pageSize: 50 });

  return (
    <main className="page-shell workspace-page">
      <section className="section-header workspace-header">
        <div className="workspace-header-main">
          <div className="workspace-meta-row">
            <p className="eyebrow">Журнал владельца</p>
            <span className="workspace-meta-chip">{audit.total} событий</span>
            <span className="workspace-meta-chip">Страница {audit.page}</span>
            <span className="workspace-meta-chip">МСК</span>
          </div>
          <h1>{treeContext.tree.title}</h1>
          <p className="muted-copy">История действий по дереву собрана в одну спокойную ленту без технического шума и лишних полей.</p>
        </div>
        <TreeNav
          slug={slug}
          shareToken={shareToken}
          canEdit={treeContext.actor.canEdit}
          canManageMembers={treeContext.actor.canManageMembers}
          canReadAudit={treeContext.actor.canReadAudit}
          canManageSettings={treeContext.actor.canManageSettings}
        />
      </section>
      <AuditLogTable entries={audit.entries} total={audit.total} page={audit.page} pageSize={audit.pageSize} slug={slug} />
    </main>
  );
}
