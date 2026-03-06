import { redirect } from "next/navigation";

import { TreeNav } from "@/components/layout/tree-nav";
import { TreeSettingsForm } from "@/components/settings/tree-settings-form";
import { getTreeSnapshot } from "@/lib/server/repository";
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
  const snapshot = await getTreeSnapshot(slug, { shareToken });

  if (!snapshot.actor.canManageSettings) {
    redirect(buildViewerHref(slug, shareToken));
  }

  return (
    <main className="page-shell workspace-page">
      <section className="section-header workspace-header">
        <div className="workspace-header-main">
          <div className="workspace-meta-row">
            <p className="eyebrow">Настройки</p>
            <span className="workspace-meta-chip">{formatTreeVisibility(snapshot.tree.visibility)}</span>
            <span className="workspace-meta-chip">{snapshot.people.length} человек</span>
          </div>
          <h1>{snapshot.tree.title}</h1>
          <p className="muted-copy">Название, адрес, корень дерева и режим доступа собраны в один спокойный экран с понятной иерархией.</p>
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
      <TreeSettingsForm tree={snapshot.tree} people={snapshot.people} />
    </main>
  );
}
