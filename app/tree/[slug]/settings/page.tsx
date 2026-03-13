import { redirect } from "next/navigation";

import { TreeNav } from "@/components/layout/tree-nav";
import { TreeSettingsForm } from "@/components/settings/tree-settings-form";
import { getBaseUrl } from "@/lib/env";
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

  return (
    <main className="page-shell workspace-page">
      <section className="section-header workspace-header">
        <div className="workspace-header-main">
          <div className="workspace-meta-row">
            <p className="eyebrow">Настройки</p>
            <span className="workspace-meta-chip">{formatTreeVisibility(pageData.tree.visibility)}</span>
            <span className="workspace-meta-chip">{pageData.people.length} человек</span>
          </div>
          <h1>{pageData.tree.title}</h1>
          <p className="muted-copy">Название, адрес, корень дерева и режим доступа собраны в один спокойный экран с понятной иерархией.</p>
        </div>
        <TreeNav
          slug={slug}
          shareToken={shareToken}
          canEdit={pageData.actor.canEdit}
          canManageMembers={pageData.actor.canManageMembers}
          canReadAudit={pageData.actor.canReadAudit}
          canManageSettings={pageData.actor.canManageSettings}
        />
      </section>
      <TreeSettingsForm tree={pageData.tree} people={pageData.people} initialBaseUrl={getBaseUrl()} />
    </main>
  );
}
