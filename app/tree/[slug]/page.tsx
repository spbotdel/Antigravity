import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/app-header";
import { TreeNav } from "@/components/layout/tree-nav";
import { Card } from "@/components/ui/card";
import { resolveHeaderModeFromActor } from "@/lib/permissions";
import { TreeViewerClient } from "@/components/tree/tree-viewer-client";
import { AppError } from "@/lib/server/errors";
import { getTreePageMetadata, getTreeSnapshot } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

interface TreePageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function getSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

export async function generateMetadata({ params, searchParams }: TreePageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const shareToken = getSearchParam(resolvedSearchParams.share);

  try {
    const metadata = await getTreePageMetadata(slug, { shareToken });

    return {
      title: metadata.title,
      description: metadata.description || "История, собранная в одном месте",
      openGraph: {
        title: metadata.title,
        description: metadata.description || "История, собранная в одном месте",
        type: "website"
      },
      twitter: {
        card: "summary",
        title: metadata.title,
        description: metadata.description || "История, собранная в одном месте"
      }
    };
  } catch {
    return {
      title: "Семейное дерево",
      description: "История, собранная в одном месте",
      openGraph: {
        title: "Семейное дерево",
        description: "История, собранная в одном месте",
        type: "website"
      },
      twitter: {
        card: "summary",
        title: "Семейное дерево",
        description: "История, собранная в одном месте"
      }
    };
  }
}

export default async function TreePage({ params, searchParams }: TreePageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const shareToken = getSearchParam(resolvedSearchParams.share);

  try {
    const snapshot = await getTreeSnapshot(slug, { shareToken });
    const headerMode = resolveHeaderModeFromActor(snapshot.actor);

    return (
      <>
        <AppHeader mode={headerMode} showDashboardLink={headerMode === "admin"} />
        <main className="page-shell tree-page-shell workspace-page-canvas tree-page-nav-scope">
          <div className="tree-page-nav-row">
            <TreeNav
              slug={slug}
              shareToken={shareToken}
              canEdit={snapshot.actor.canEdit}
              canManageMembers={snapshot.actor.canManageMembers}
              canReadAudit={snapshot.actor.canReadAudit}
              canManageSettings={snapshot.actor.canManageSettings}
            />
          </div>
          <TreeViewerClient
            snapshot={snapshot}
            shareToken={shareToken}
          />
        </main>
      </>
    );
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Не удалось загрузить семейное дерево.";
    return (
      <main className="page-shell narrow-shell">
        <Card className="auth-card">
          <div className="auth-card-copy">
            <p className="eyebrow">Проблема с доступом</p>
            <h1>Дерево недоступно</h1>
          </div>
          <p className="form-error">{message}</p>
        </Card>
      </main>
    );
  }
}
