import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { TreeNav } from "@/components/layout/tree-nav";
import { BuilderWorkspace } from "@/components/tree/builder-workspace";
import { resolveHeaderModeFromActor } from "@/lib/permissions";
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
    snapshot = await getBuilderSnapshot(slug, { includeMedia: true, shareToken });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect(buildViewerHref(slug, shareToken));
    }

    throw error;
  }

  if (!snapshot.actor.canEdit) {
    redirect(buildViewerHref(slug, shareToken));
  }

  const headerMode = resolveHeaderModeFromActor(snapshot.actor);

  return (
    <>
      <AppHeader mode={headerMode} showDashboardLink={headerMode === "admin"} />
      <main className="page-shell workspace-page workspace-page-canvas">
        <BuilderWorkspace
          snapshot={snapshot}
          mediaLoaded
          nav={
            <TreeNav
              slug={slug}
              shareToken={shareToken}
              canEdit={snapshot.actor.canEdit}
              canManageMembers={snapshot.actor.canManageMembers}
              canReadAudit={snapshot.actor.canReadAudit}
              canManageSettings={snapshot.actor.canManageSettings}
            />
          }
        />
      </main>
    </>
  );
}
