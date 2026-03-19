import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { formatRole, formatTreeVisibility } from "@/lib/ui-text";
import { CreateTreeForm } from "@/components/dashboard/create-tree-form";
import type { DashboardModel, DashboardTreeItem } from "@/components/dashboard/dashboard-model";

interface DashboardOverviewProps {
  dashboard: DashboardModel;
}

function getSecondarySectionTitle(items: DashboardTreeItem[]) {
  return items.some((item) => item.membership.role === "owner") ? "Другие деревья" : "Доступ по приглашениям";
}

function getCreatePanelCopy(dashboardState: DashboardModel["dashboardState"]) {
  if (dashboardState === "invited_only") {
    return {
      title: "Создайте свое дерево",
      description: "Приглашенные деревья останутся в списке, а собственное дерево появится как основной рабочий контур.",
      submitLabel: "Создать дерево"
    };
  }

  return {
    title: "Создайте первое дерево",
    description: "После создания вы сразу перейдете в конструктор и сможете продолжить работу уже из этого dashboard.",
    submitLabel: "Создать дерево"
  };
}

export function DashboardOverview({ dashboard }: DashboardOverviewProps) {
  const createPanelCopy = getCreatePanelCopy(dashboard.dashboardState);
  const secondarySectionTitle = getSecondarySectionTitle(dashboard.secondaryItems);

  return (
    <div className="dashboard-workspace">
      {dashboard.primaryOwnedItem ? (
        <Card className="dashboard-primary-card p-0">
          <CardHeader className="px-6 pt-6 pb-0">
            <div className="dashboard-primary-topline">
              <div className="meta-row meta-row-tight">
                <Badge className="meta-pill">{formatRole(dashboard.primaryOwnedItem.membership.role)}</Badge>
                <Badge className="meta-pill meta-pill-muted" variant="secondary">
                  {formatTreeVisibility(dashboard.primaryOwnedItem.tree.visibility)}
                </Badge>
              </div>
              <span className="dashboard-primary-slug">/tree/{dashboard.primaryOwnedItem.tree.slug}</span>
            </div>
            <div className="dashboard-primary-copy">
              <p className="card-kicker">Ваше дерево</p>
              <h2 className="card-heading">{dashboard.primaryOwnedItem.tree.title}</h2>
              <p className="card-copy">{dashboard.primaryOwnedItem.tree.description || "Описание пока не заполнено."}</p>
            </div>
          </CardHeader>
          <CardContent className="px-6 pt-0 pb-0">
            <div className="dashboard-fact-grid">
              <div className="dashboard-fact-card">
                <span>Доступ</span>
                <strong>{formatTreeVisibility(dashboard.primaryOwnedItem.tree.visibility)}</strong>
              </div>
              <div className="dashboard-fact-card">
                <span>Адрес</span>
                <strong>/tree/{dashboard.primaryOwnedItem.tree.slug}</strong>
              </div>
            </div>
          </CardContent>
          <CardFooter className="dashboard-primary-actions border-0 bg-transparent px-6 pt-0 pb-6">
            <div className="action-row dashboard-card-actions">
              <Link href={`/tree/${dashboard.primaryOwnedItem.tree.slug}/builder`} className={buttonVariants()}>
                Открыть конструктор
              </Link>
              <Link href={`/tree/${dashboard.primaryOwnedItem.tree.slug}`} className={buttonVariants({ variant: "secondary" })}>
                Открыть просмотр
              </Link>
            </div>
            <p className="dashboard-action-note">Конструктор нужен для изменений, просмотр для спокойной проверки структуры и доступа.</p>
          </CardFooter>
        </Card>
      ) : null}

      {dashboard.secondaryItems.length ? (
        <section className="dashboard-secondary-section">
          <div className="dashboard-section-heading">
            <p className="eyebrow">Дополнительно</p>
            <h2 className="card-heading">{secondarySectionTitle}</h2>
            <p className="muted-copy">Здесь остаются приглашенные деревья и дополнительные рабочие контуры, чтобы основной экран не перегружался.</p>
          </div>
          <div className="dashboard-secondary-grid">
            {dashboard.secondaryItems.map(({ membership, tree }) => {
              const canEdit = membership.role === "owner" || membership.role === "admin";

              return (
                <Card key={`${membership.id}-${tree.id}`} className="dashboard-compact-card p-0" size="sm">
                  <CardHeader className="px-[18px] pt-[18px] pb-0">
                    <div className="dashboard-compact-topline">
                      <div className="meta-row meta-row-tight">
                        <Badge className="meta-pill">{formatRole(membership.role)}</Badge>
                        <Badge className="meta-pill meta-pill-muted" variant="secondary">
                          {formatTreeVisibility(tree.visibility)}
                        </Badge>
                      </div>
                      <span className="dashboard-card-slug">/tree/{tree.slug}</span>
                    </div>
                    <div className="dashboard-card-copy">
                      <h3 className="card-heading">{tree.title}</h3>
                      <p className="card-copy">{tree.description || "Описание пока не заполнено."}</p>
                    </div>
                  </CardHeader>
                  <CardFooter className="action-row dashboard-card-actions border-0 bg-transparent px-[18px] pt-0 pb-[18px]">
                    {canEdit ? (
                      <>
                        <Link href={`/tree/${tree.slug}/builder`} className={buttonVariants()}>
                          В конструктор
                        </Link>
                        <Link href={`/tree/${tree.slug}`} className={buttonVariants({ variant: "secondary" })}>
                          Открыть просмотр
                        </Link>
                      </>
                    ) : (
                      <Link href={`/tree/${tree.slug}`} className={buttonVariants()}>
                        Открыть просмотр
                      </Link>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {dashboard.canCreateOwnedTree ? (
        <Card className="dashboard-create-card p-0">
          <CardHeader className="dashboard-section-heading px-6 pt-6 pb-0">
            <p className="card-kicker">Новое дерево</p>
            <h2 className="card-heading">{createPanelCopy.title}</h2>
            <p className="muted-copy">{createPanelCopy.description}</p>
          </CardHeader>
          <CardContent className="px-6 pt-0 pb-6">
            <CreateTreeForm submitLabel={createPanelCopy.submitLabel} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
