import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { TreeNav } from "@/components/layout/tree-nav";
import { TreeSettingsForm } from "@/components/settings/tree-settings-form";
import { getBaseUrl } from "@/lib/env";
import { resolveHeaderModeFromActor } from "@/lib/permissions";
import { AppError } from "@/lib/server/errors";
import { getTreeSettingsPageData } from "@/lib/server/repository";
import { formatTreeVisibility } from "@/lib/ui-text";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
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

export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const shareToken = getSearchParam(resolvedSearchParams.share);
  let pageData;
  try {
    pageData = await getTreeSettingsPageData(slug, { shareToken });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect(buildViewerHref(slug, shareToken));
    }

    throw error;
  }

  if (!pageData.actor.canManageSettings) {
    redirect(buildViewerHref(slug, shareToken));
  }

  const headerMode = resolveHeaderModeFromActor(pageData.actor);

  return (
    <>
      <AppHeader mode={headerMode} showDashboardLink={headerMode === "admin"} />
      <main className="page-shell tree-page-shell utility-page-shell tree-page-nav-scope">
        <div className="tree-page-nav-row">
          <TreeNav
            slug={slug}
            shareToken={shareToken}
            canEdit={pageData.actor.canEdit}
            canManageMembers={pageData.actor.canManageMembers}
            canReadAudit={pageData.actor.canReadAudit}
            canManageSettings={pageData.actor.canManageSettings}
          />
        </div>
        <section className="section-header workspace-header utility-page-header">
          <div className="workspace-header-main">
            <h1>{pageData.tree.title}</h1>
            <div className="workspace-meta-row">
              <p className="eyebrow">Настройки</p>
              <span className="workspace-meta-chip">{formatTreeVisibility(pageData.tree.visibility)}</span>
              <span className="workspace-meta-chip">Корень и доступ</span>
            </div>
            <p className="muted-copy">Корень дерева и режим доступа собраны в один спокойный экран с понятной иерархией.</p>
          </div>
        </section>
        <TreeSettingsForm tree={pageData.tree} people={pageData.people} initialBaseUrl={getBaseUrl()} />
      </main>
    </>
  );
}
