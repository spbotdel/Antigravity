"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { InviteRecord, MembershipRecord, TreeRecord } from "@/lib/types";
import { formatInviteMethod, formatMembershipStatus, formatRole, formatTreeVisibility } from "@/lib/ui-text";

interface MemberManagementPanelProps {
  tree: TreeRecord;
  memberships: MembershipRecord[];
  invites: InviteRecord[];
}

export function MemberManagementPanel({ tree, memberships, invites }: MemberManagementPanelProps) {
  const router = useRouter();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeMemberships = memberships.filter((membership) => membership.status === "active");
  const managers = activeMemberships.filter((membership) => membership.role === "owner" || membership.role === "admin");
  const pendingInvites = invites.filter((invite) => !invite.accepted_at);
  const acceptedInvites = invites.filter((invite) => Boolean(invite.accepted_at));

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString("ru-RU");
  }

  function getMembershipTitle(membership: MembershipRecord) {
    if (membership.role === "owner") {
      return "Владелец дерева";
    }

    if (membership.role === "admin") {
      return "Администратор дерева";
    }

    return "Участник дерева";
  }

  function getMembershipDescription(membership: MembershipRecord) {
    if (membership.role === "owner") {
      return "Роль владельца в v1 закреплена за деревом и не переназначается.";
    }

    if (membership.role === "admin") {
      return "Может редактировать дерево и управлять частью рабочих действий без смены владельца.";
    }

    return "Имеет доступ к просмотру и может быть повышен до администратора прямо из этого списка.";
  }

  async function refreshAfter(action: Promise<Response>) {
    const response = await action;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "Запрос не выполнен.");
      return null;
    }

    setError(null);
    router.refresh();
    return payload;
  }

  return (
    <div className="members-layout">
      <section className="members-summary-grid">
        <article className="surface-card members-summary-card">
          <span>Активные</span>
          <strong>{activeMemberships.length}</strong>
          <p>Уже имеют доступ к дереву.</p>
        </article>
        <article className="surface-card members-summary-card">
          <span>Ожидают</span>
          <strong>{pendingInvites.length}</strong>
          <p>Еще не приняли приглашение.</p>
        </article>
        <article className="surface-card members-summary-card">
          <span>Управляют</span>
          <strong>{managers.length}</strong>
          <p>Владелец и администраторы.</p>
        </article>
        <article className="surface-card members-summary-card">
          <span>Доступ</span>
          <strong>{formatTreeVisibility(tree.visibility)}</strong>
          <p>Текущий режим открытия дерева.</p>
        </article>
      </section>

      <section className="surface-card members-invite-card">
        <div className="members-section-heading">
          <p className="eyebrow">Приглашение</p>
          <h2>Пригласите нового участника</h2>
          <p className="muted-copy">Выберите роль, способ приглашения и срок действия. Готовую ссылку можно отправить сразу.</p>
        </div>
        <div className="members-context-row">
          <span className="meta-pill meta-pill-muted">{formatTreeVisibility(tree.visibility)} дерево</span>
          <span className="meta-pill meta-pill-muted">Ожидают: {pendingInvites.length}</span>
          <span className="meta-pill meta-pill-muted">Приняли: {acceptedInvites.length}</span>
        </div>
        <form
          className="stack-form members-invite-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const payload = await refreshAfter(
              fetch("/api/invites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  treeId: tree.id,
                  role: String(form.get("role") || "viewer"),
                  inviteMethod: String(form.get("inviteMethod") || "link"),
                  email: String(form.get("email") || ""),
                  expiresInDays: Number(form.get("expiresInDays") || 7)
                })
              })
            );

            if (payload?.url) {
              setInviteLink(payload.url);
            }
          }}
        >
          <div className="field-grid field-grid-2">
            <label>
              Роль
              <select name="role" defaultValue="viewer">
                <option value="viewer">Участник</option>
                <option value="admin">Администратор</option>
              </select>
            </label>
            <label>
              Способ приглашения
              <select name="inviteMethod" defaultValue="link">
                <option value="link">Защищенная ссылка</option>
                <option value="email">Отправка на email позже</option>
              </select>
            </label>
          </div>
          <div className="field-grid field-grid-2">
            <label>
              Почта
              <input name="email" type="email" placeholder="Необязательно для приглашения ссылкой" />
            </label>
            <label>
              Срок действия, дней
              <input name="expiresInDays" type="number" min={1} max={30} defaultValue={7} />
            </label>
          </div>
          <button className="primary-button" type="submit">
            Создать приглашение
          </button>
        </form>
        {inviteLink ? (
          <div className="inline-feedback-card inline-feedback-card-success">
            <span className="inline-feedback-label">Приглашение готово</span>
            <strong>Скопируйте ссылку и отправьте ее участнику.</strong>
            <p>{inviteLink}</p>
          </div>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      <section className="surface-card members-list-card">
        <div className="members-section-heading">
          <p className="eyebrow">Участники дерева</p>
          <h2>Кто уже имеет доступ</h2>
          <p className="muted-copy">Каждая роль показана отдельно, а быстрые действия остаются прямо в карточке участника.</p>
        </div>
        <div className="members-card-list">
          {memberships.map((membership) => (
            <article key={membership.id} className="members-entry-card">
              <div className="members-entry-topline">
                <div className="meta-row meta-row-tight">
                  <span className="meta-pill">{formatRole(membership.role)}</span>
                  <span className="meta-pill meta-pill-muted">{formatMembershipStatus(membership.status)}</span>
                </div>
                <span className="members-entry-id">{membership.user_id}</span>
              </div>
              <div className="members-entry-copy">
                <strong>{getMembershipTitle(membership)}</strong>
                <p>{getMembershipDescription(membership)}</p>
              </div>
              <div className="card-actions members-entry-actions">
                {membership.role !== "owner" ? (
                  <>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={async () => {
                        await refreshAfter(
                          fetch(`/api/members/${membership.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ role: membership.role === "viewer" ? "admin" : "viewer" })
                          })
                        );
                      }}
                    >
                      {membership.role === "viewer" ? "Сделать администратором" : "Сделать участником"}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={async () => {
                        await refreshAfter(fetch(`/api/members/${membership.id}`, { method: "DELETE" }));
                      }}
                    >
                      Отозвать доступ
                    </button>
                  </>
                ) : (
                  <span className="members-static-note">Владелец закреплен за деревом</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card members-list-card">
        <div className="members-section-heading">
          <p className="eyebrow">Приглашения</p>
          <h2>Что уже отправлено</h2>
          <p className="muted-copy">Здесь видны роль, способ отправки и текущее состояние каждого приглашения.</p>
        </div>
        <div className="members-context-row">
          <span className="meta-pill meta-pill-muted">Всего: {invites.length}</span>
          <span className="meta-pill meta-pill-muted">Ожидают: {pendingInvites.length}</span>
          <span className="meta-pill meta-pill-muted">Приняты: {acceptedInvites.length}</span>
        </div>
        <div className="members-card-list">
          {invites.length ? (
            invites.map((invite) => (
              <article key={invite.id} className="members-entry-card">
                <div className="members-entry-topline">
                  <div className="meta-row meta-row-tight">
                    <span className="meta-pill">{formatRole(invite.role)}</span>
                    <span className="meta-pill meta-pill-muted">{formatInviteMethod(invite.invite_method)}</span>
                  </div>
                  <span className={invite.accepted_at ? "members-invite-status members-invite-status-accepted" : "members-invite-status"}>
                    {invite.accepted_at ? "Принято" : "Ожидает"}
                  </span>
                </div>
                <div className="members-entry-copy">
                  <strong>{invite.email || "Приглашение только по защищенной ссылке"}</strong>
                  <p>{invite.accepted_at ? `Принято ${formatDateTime(invite.accepted_at)}.` : `Истекает ${formatDateTime(invite.expires_at)}.`}</p>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">Приглашения еще не создавались.</div>
          )}
        </div>
        {acceptedInvites.length ? (
          <p className="members-footnote">Принятых приглашений: {acceptedInvites.length}. Активный доступ после принятия уже отражается в списке участников.</p>
        ) : null}
      </section>
    </div>
  );
}
