import Link from "next/link";

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
      description: "Приглашенные деревья останутся доступными здесь, а собственное дерево станет вашим основным рабочим пространством.",
      submitLabel: "Создать свое дерево"
    };
  }

  return {
    title: "Создайте первое дерево",
    description: "После создания вы сразу перейдете в конструктор и сможете продолжить работу уже из этого dashboard.",
    submitLabel: "Создать первое дерево"
  };
}

export function DashboardOverview({ dashboard }: DashboardOverviewProps) {
  const createPanelCopy = getCreatePanelCopy(dashboard.dashboardState);
  const secondarySectionTitle = getSecondarySectionTitle(dashboard.secondaryItems);

  return (
    <div className="dashboard-workspace">
      {dashboard.primaryOwnedItem ? (
        <section className="surface-card dashboard-primary-card">
          <div className="dashboard-primary-topline">
            <div className="meta-row meta-row-tight">
              <span className="meta-pill">{formatRole(dashboard.primaryOwnedItem.membership.role)}</span>
              <span className="meta-pill meta-pill-muted">{formatTreeVisibility(dashboard.primaryOwnedItem.tree.visibility)}</span>
            </div>
            <span className="dashboard-primary-slug">/tree/{dashboard.primaryOwnedItem.tree.slug}</span>
          </div>
          <div className="dashboard-primary-copy">
            <p className="card-kicker">Основное рабочее пространство</p>
            <h2>{dashboard.primaryOwnedItem.tree.title}</h2>
            <p>{dashboard.primaryOwnedItem.tree.description || "Короткое описание пока не добавлено."}</p>
          </div>
          <div className="dashboard-fact-grid">
            <div className="dashboard-fact-card">
              <span>Режим доступа</span>
              <strong>{formatTreeVisibility(dashboard.primaryOwnedItem.tree.visibility)}</strong>
            </div>
            <div className="dashboard-fact-card">
              <span>Адрес дерева</span>
              <strong>/tree/{dashboard.primaryOwnedItem.tree.slug}</strong>
            </div>
          </div>
          <div className="dashboard-primary-actions">
            <div className="card-actions dashboard-card-actions">
              <Link href={`/tree/${dashboard.primaryOwnedItem.tree.slug}/builder`} className="primary-button">
                Продолжить редактирование
              </Link>
              <Link href={`/tree/${dashboard.primaryOwnedItem.tree.slug}`} className="secondary-button">
                Открыть дерево
              </Link>
            </div>
            <p className="dashboard-action-note">Конструктор для изменений, просмотр для спокойной проверки структуры и доступа.</p>
          </div>
        </section>
      ) : null}

      {dashboard.canCreateOwnedTree ? (
        <section className="surface-card dashboard-create-card">
          <div className="dashboard-section-heading">
            <p className="card-kicker">Новый старт</p>
            <h2>{createPanelCopy.title}</h2>
            <p className="muted-copy">{createPanelCopy.description}</p>
          </div>
          <CreateTreeForm submitLabel={createPanelCopy.submitLabel} />
        </section>
      ) : null}

      {dashboard.secondaryItems.length ? (
        <section className="dashboard-secondary-section">
          <div className="dashboard-section-heading">
            <p className="eyebrow">Рабочие пространства</p>
            <h2>{secondarySectionTitle}</h2>
          </div>
          <div className="dashboard-secondary-grid">
            {dashboard.secondaryItems.map(({ membership, tree }) => {
              const canEdit = membership.role === "owner" || membership.role === "admin";

              return (
                <article key={`${membership.id}-${tree.id}`} className="surface-card dashboard-compact-card">
                  <div className="dashboard-compact-topline">
                    <div className="meta-row meta-row-tight">
                      <span className="meta-pill">{formatRole(membership.role)}</span>
                      <span className="meta-pill meta-pill-muted">{formatTreeVisibility(tree.visibility)}</span>
                    </div>
                    <span className="dashboard-card-slug">/tree/{tree.slug}</span>
                  </div>
                  <div className="dashboard-card-copy">
                    <h3>{tree.title}</h3>
                    <p>{tree.description || "Описание пока не добавлено."}</p>
                  </div>
                  <div className="card-actions dashboard-card-actions">
                    {canEdit ? (
                      <>
                        <Link href={`/tree/${tree.slug}/builder`} className="primary-button">
                          Редактировать дерево
                        </Link>
                        <Link href={`/tree/${tree.slug}`} className="secondary-button">
                          Открыть дерево
                        </Link>
                      </>
                    ) : (
                      <Link href={`/tree/${tree.slug}`} className="primary-button">
                        Открыть дерево
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
