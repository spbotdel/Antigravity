"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import type { InviteRecord, MembershipRecord, ShareLinkRecord, TreeRecord } from "@/lib/types";
import { formatInviteMethod, formatMembershipStatus, formatRole, formatTreeVisibility } from "@/lib/ui-text";

interface MemberManagementPanelProps {
  tree: TreeRecord;
  memberships: MembershipRecord[];
  invites: InviteRecord[];
  shareLinks: ShareLinkRecord[];
}

export function MemberManagementPanel({ tree, memberships, invites, shareLinks }: MemberManagementPanelProps) {
  const [isClientReady, setIsClientReady] = useState(false);
  const [membershipState, setMembershipState] = useState(memberships);
  const [inviteState, setInviteState] = useState(invites);
  const [shareLinkState, setShareLinkState] = useState(shareLinks);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteDeliveryMessage, setInviteDeliveryMessage] = useState<string | null>(null);
  const [shareLinkUrl, setShareLinkUrl] = useState<string | null>(null);
  const [revealedShareLinkUrls, setRevealedShareLinkUrls] = useState<Record<string, string>>({});
  const [shareLinkRevealMessages, setShareLinkRevealMessages] = useState<Record<string, string>>({});
  const [revealingShareLinkId, setRevealingShareLinkId] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<"viewer" | "admin">("viewer");
  const [inviteMethod, setInviteMethod] = useState<"link" | "email">("link");
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeMemberships = membershipState.filter((membership) => membership.status === "active");
  const managers = activeMemberships.filter((membership) => membership.role === "owner" || membership.role === "admin");
  const pendingInvites = inviteState.filter((invite) => !invite.accepted_at);
  const acceptedInvites = inviteState.filter((invite) => Boolean(invite.accepted_at));
  const activeShareLinks = shareLinkState.filter((shareLink) => !shareLink.revoked_at && new Date(shareLink.expires_at).getTime() >= Date.now());

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    setMembershipState(memberships);
  }, [memberships]);

  useEffect(() => {
    setInviteState(invites);
  }, [invites]);

  useEffect(() => {
    setShareLinkState(shareLinks);
    const shareLinkIds = new Set(shareLinks.map((shareLink) => shareLink.id));
    setRevealedShareLinkUrls((current) =>
      Object.fromEntries(Object.entries(current).filter(([shareLinkId]) => shareLinkIds.has(shareLinkId)))
    );
    setShareLinkRevealMessages((current) =>
      Object.fromEntries(Object.entries(current).filter(([shareLinkId]) => shareLinkIds.has(shareLinkId)))
    );
  }, [shareLinks]);

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString("ru-RU");
  }

  function getShareLinkStatus(shareLink: ShareLinkRecord) {
    if (shareLink.revoked_at) {
      return "Отозвана";
    }

    if (new Date(shareLink.expires_at).getTime() < Date.now()) {
      return "Истекла";
    }

    return "Активна";
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

  function getInviteRoleHint() {
    if (inviteRole === "admin") {
      return "Подходит для родственника-помощника, который будет редактировать дерево и загружать файлы.";
    }

    return "Подходит для человека с постоянным доступом по аккаунту, но без редактирования дерева.";
  }

  function getInviteMethodHint() {
    if (inviteMethod === "email") {
      return "Если Resend настроен, письмо уйдет автоматически. Если нет, ссылка все равно сохранится для ручной отправки.";
    }

    return "Самый быстрый путь: ссылка создается сразу, и ее можно тут же отправить человеку.";
  }

  function resolveRemainingDays(expiresAt: string, fallbackDays: number) {
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      return fallbackDays;
    }

    const remainingMs = expiresAtMs - Date.now();
    const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    return Math.min(30, Math.max(1, remainingDays || fallbackDays));
  }

  async function copyText(value: string, successLabel: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedMessage(successLabel);
      setError(null);
    } catch {
      setCopiedMessage(null);
      setError("Не удалось скопировать ссылку автоматически. Скопируйте ее вручную.");
    }
  }

  async function runAction(action: Promise<Response>) {
    const response = await action;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "Запрос не выполнен.");
      return null;
    }

    setError(null);
    return payload;
  }

  async function reissueInvite(invite: InviteRecord) {
    const payload = await runAction(
      fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treeId: tree.id,
          role: invite.role,
          inviteMethod: invite.invite_method,
          email: invite.email || "",
          expiresInDays: resolveRemainingDays(invite.expires_at, 7)
        })
      })
    );

    if (!payload) {
      return;
    }

    if (payload.invite) {
      setInviteState((current) => [payload.invite as InviteRecord, ...current.filter((item) => item.id !== invite.id)]);
    }
    if (payload.url) {
      setInviteLink(payload.url);
      setShareLinkUrl(null);
      setCopiedMessage(null);
    }
    setInviteDeliveryMessage(typeof payload.deliveryMessage === "string" ? payload.deliveryMessage : null);

    const revokedPayload = await runAction(fetch(`/api/invites/${invite.id}`, { method: "DELETE" }));
    if (revokedPayload !== null) {
      setInviteState((current) => current.filter((item) => item.id !== invite.id));
    }
  }

  async function reissueShareLink(shareLink: ShareLinkRecord) {
    const payload = await runAction(
      fetch("/api/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treeId: tree.id,
          treeSlug: tree.slug,
          label: shareLink.label,
          expiresInDays: resolveRemainingDays(shareLink.expires_at, 14)
        })
      })
    );

    if (!payload) {
      return;
    }

    const nextShareLink = payload.shareLink as ShareLinkRecord | undefined;
    if (nextShareLink) {
      setShareLinkState((current) => [nextShareLink, ...current.filter((item) => item.id !== shareLink.id)]);
      setShareLinkRevealMessages((current) => {
        const nextState = { ...current };
        delete nextState[shareLink.id];
        return nextState;
      });
    }
    if (payload.url) {
      setShareLinkUrl(payload.url);
      setInviteLink(null);
      setCopiedMessage(null);
      if (nextShareLink) {
        setRevealedShareLinkUrls((current) => {
          const nextState = { ...current };
          delete nextState[shareLink.id];
          nextState[nextShareLink.id] = payload.url as string;
          return nextState;
        });
      }
    }

    if (!shareLink.revoked_at) {
      const revokedPayload = await runAction(fetch(`/api/share-links/${shareLink.id}`, { method: "DELETE" }));
      if (revokedPayload?.shareLink) {
        const revokedShareLink = revokedPayload.shareLink as ShareLinkRecord;
        setShareLinkState((current) =>
          current.map((item) => (item.id === shareLink.id ? revokedShareLink : item))
        );
      } else if (revokedPayload !== null) {
        setShareLinkState((current) =>
          current.map((item) =>
            item.id === shareLink.id ? { ...item, revoked_at: new Date().toISOString() } : item
          )
          );
      }
      return;
    }
  }

  async function revealStoredShareLink(shareLink: ShareLinkRecord) {
    setRevealingShareLinkId(shareLink.id);
    const payload = await runAction(fetch(`/api/share-links/${shareLink.id}`));
    setRevealingShareLinkId(null);
    if (!payload) {
      return;
    }

    setCopiedMessage(null);
    const revealedUrl = typeof payload.url === "string" ? payload.url : null;
    const revealMessage = typeof payload.message === "string" ? payload.message : null;
    if (revealedUrl) {
      setRevealedShareLinkUrls((current) => ({ ...current, [shareLink.id]: revealedUrl }));
      setShareLinkRevealMessages((current) => {
        const nextState = { ...current };
        delete nextState[shareLink.id];
        return nextState;
      });
      return;
    }

    setRevealedShareLinkUrls((current) => {
      const nextState = { ...current };
      delete nextState[shareLink.id];
      return nextState;
    });
    if (revealMessage) {
      setShareLinkRevealMessages((current) => ({ ...current, [shareLink.id]: revealMessage }));
    }
  }

  if (!isClientReady) {
    return (
      <Card className="members-loading-state p-6" data-testid="member-management-panel-loading">
        <p className="eyebrow">Участники</p>
        <h2 className="card-heading">Подготавливаю доступы и приглашения</h2>
        <p className="muted-copy">Список участников, приглашений и семейных ссылок загрузится сразу после инициализации клиента.</p>
      </Card>
    );
  }

  return (
    <div className="members-layout utility-surface-layout">
      <section className="members-summary-grid utility-summary-grid">
        <Card className="members-summary-card utility-summary-card">
          <span>Активные</span>
          <strong>{activeMemberships.length}</strong>
          <p>Уже имеют доступ к дереву.</p>
        </Card>
        <Card className="members-summary-card utility-summary-card">
          <span>Ожидают</span>
          <strong>{pendingInvites.length}</strong>
          <p>Еще не приняли приглашение.</p>
        </Card>
        <Card className="members-summary-card utility-summary-card">
          <span>Управляют</span>
          <strong>{managers.length}</strong>
          <p>Владелец и администраторы.</p>
        </Card>
        <Card className="members-summary-card utility-summary-card">
          <span>Доступ</span>
          <strong>{formatTreeVisibility(tree.visibility)}</strong>
          <p>Текущий режим открытия дерева.</p>
        </Card>
        <Card className="members-summary-card utility-summary-card">
          <span>Ссылки</span>
          <strong>{activeShareLinks.length}</strong>
          <p>Активные семейные ссылки для просмотра.</p>
        </Card>
      </section>

      <section className="members-guidance-grid">
        <Card className="members-guidance-card utility-note-card">
          <p className="eyebrow">По аккаунту</p>
          <strong>Приглашение участника</strong>
          <p>Используйте, если человеку нужен постоянный доступ под своей ролью, а не просто просмотр по ссылке.</p>
        </Card>
        <Card className="members-guidance-card utility-note-card">
          <p className="eyebrow">Без аккаунта</p>
          <strong>Семейная ссылка</strong>
          <p>Подходит для родственников, которым нужен только просмотр дерева и файлов без отдельной регистрации.</p>
        </Card>
      </section>

      {copiedMessage ? <p className="form-success">{copiedMessage}</p> : null}

      <Card className="members-invite-card utility-section-card p-6">
        <div className="members-section-heading utility-section-heading">
          <p className="eyebrow">Приглашение</p>
          <h2 className="card-heading">Пригласите нового участника</h2>
          <p className="muted-copy">Выберите роль, способ приглашения и срок действия. Готовую ссылку можно отправить сразу.</p>
        </div>
        <div className="members-context-row utility-context-row">
          <Badge className="meta-pill meta-pill-muted" variant="secondary">
            {formatTreeVisibility(tree.visibility)} дерево
          </Badge>
          <Badge className="meta-pill meta-pill-muted" variant="secondary">
            Ожидают: {pendingInvites.length}
          </Badge>
          <Badge className="meta-pill meta-pill-muted" variant="secondary">
            Приняли: {acceptedInvites.length}
          </Badge>
        </div>
        <form
          className="stack-form members-invite-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const payload = await runAction(
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

            if (payload?.invite) {
              setInviteState((current) => [payload.invite as InviteRecord, ...current]);
            }
            if (payload?.url) {
              setInviteLink(payload.url);
            }
            setInviteDeliveryMessage(typeof payload?.deliveryMessage === "string" ? payload.deliveryMessage : null);
            setShareLinkUrl(null);
            setCopiedMessage(null);
          }}
        >
          <div className="form-grid form-grid-2">
            <label className="form-field">
              Роль
              <SelectField name="role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "viewer" | "admin")}>
                <option value="viewer">Участник</option>
                <option value="admin">Администратор</option>
              </SelectField>
            </label>
            <label className="form-field">
              Способ приглашения
              <SelectField name="inviteMethod" value={inviteMethod} onChange={(event) => setInviteMethod(event.target.value as "link" | "email")}>
                <option value="link">Защищенная ссылка</option>
                <option value="email">Отправить на email</option>
              </SelectField>
            </label>
          </div>
          <div className="form-grid form-grid-2">
            <label className="form-field">
              Почта
              <Input name="email" type="email" placeholder={inviteMethod === "email" ? "name@example.com" : "Необязательно для приглашения ссылкой"} />
            </label>
            <label className="form-field">
              Срок действия, дней
              <Input name="expiresInDays" type="number" min={1} max={30} defaultValue={7} />
            </label>
          </div>
          <Button type="submit">
            Создать приглашение
          </Button>
          <p className="members-helper-note">{getInviteRoleHint()}</p>
          <p className="members-helper-note">{getInviteMethodHint()}</p>
        </form>
        {inviteLink ? (
          <div className="inline-feedback-card inline-feedback-card-success">
            <span className="inline-feedback-label">Приглашение готово</span>
            <strong>Скопируйте ссылку и отправьте ее участнику.</strong>
            {inviteDeliveryMessage ? <p>{inviteDeliveryMessage}</p> : null}
            <p>{inviteLink}</p>
            <div className="action-row members-inline-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  void copyText(inviteLink, "Ссылка приглашения скопирована.");
                }}
              >
                Скопировать ссылку
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setInviteLink(null);
                  setInviteDeliveryMessage(null);
                }}
              >
                Скрыть
              </Button>
            </div>
          </div>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
      </Card>

      <Card className="members-invite-card utility-section-card p-6">
        <div className="members-section-heading utility-section-heading">
          <p className="eyebrow">Семейные ссылки</p>
          <h2 className="card-heading">Ссылка для просмотра без аккаунта</h2>
          <p className="muted-copy">Эта ссылка открывает дерево в режиме чтения. Подходит для родственников, которым нужен только просмотр.</p>
        </div>
        <div className="members-context-row utility-context-row">
          <Badge className="meta-pill meta-pill-muted" variant="secondary">
            Активны: {activeShareLinks.length}
          </Badge>
          <Badge className="meta-pill meta-pill-muted" variant="secondary">
            Всего: {shareLinks.length}
          </Badge>
        </div>
        <form
          className="stack-form members-invite-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const payload = await runAction(
              fetch("/api/share-links", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  treeId: tree.id,
                  treeSlug: tree.slug,
                  label: String(form.get("label") || ""),
                  expiresInDays: Number(form.get("expiresInDays") || 14)
                })
              })
            );

            if (payload?.shareLink) {
              const nextShareLink = payload.shareLink as ShareLinkRecord;
              setShareLinkState((current) => [nextShareLink, ...current]);
              if (payload?.url) {
                setRevealedShareLinkUrls((current) => ({ ...current, [nextShareLink.id]: payload.url as string }));
              }
            }
            if (payload?.url) {
              setShareLinkUrl(payload.url);
            }

            setInviteLink(null);
            setCopiedMessage(null);
          }}
        >
          <div className="form-grid form-grid-2">
            <label className="form-field">
              Название
              <Input name="label" type="text" maxLength={120} placeholder="Например: Родные из РФ" />
            </label>
            <label className="form-field">
              Срок действия, дней
              <Input name="expiresInDays" type="number" min={1} max={30} defaultValue={14} />
            </label>
          </div>
          <Button type="submit">
            Создать ссылку для просмотра
          </Button>
          <p className="members-helper-note">Эта ссылка не выдает роль в дереве и подходит только для безопасного семейного read-only доступа.</p>
        </form>
        {shareLinkUrl ? (
          <div className="inline-feedback-card inline-feedback-card-success">
            <span className="inline-feedback-label">Ссылка готова</span>
            <strong>Скопируйте и отправьте родственнику.</strong>
            <p>{shareLinkUrl}</p>
            <div className="action-row members-inline-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  void copyText(shareLinkUrl, "Семейная ссылка скопирована.");
                }}
              >
                Скопировать ссылку
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setShareLinkUrl(null);
                }}
              >
                Скрыть
              </Button>
            </div>
          </div>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
      </Card>

      <Card className="members-list-card utility-section-card p-6">
        <div className="members-section-heading utility-section-heading">
          <p className="eyebrow">Участники дерева</p>
          <h2 className="card-heading">Кто уже имеет доступ</h2>
          <p className="muted-copy">Каждая роль показана отдельно, а быстрые действия остаются прямо в карточке участника.</p>
        </div>
        <div className="members-card-list utility-entry-list">
          {membershipState.map((membership) => (
            <article key={membership.id} className="members-entry-card utility-entry-card">
              <div className="members-entry-topline">
                <div className="meta-row meta-row-tight">
                  <Badge className="meta-pill">{formatRole(membership.role)}</Badge>
                  <Badge className="meta-pill meta-pill-muted" variant="secondary">
                    {formatMembershipStatus(membership.status)}
                  </Badge>
                </div>
                <span className="members-entry-id">{membership.user_id}</span>
              </div>
              <div className="members-entry-copy">
                <strong>{getMembershipTitle(membership)}</strong>
                <p>{getMembershipDescription(membership)}</p>
              </div>
              <div className="action-row members-entry-actions">
                {membership.role !== "owner" ? (
                  <>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={async () => {
                        await runAction(
                          fetch(`/api/members/${membership.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ role: membership.role === "viewer" ? "admin" : "viewer" })
                          })
                        ).then((payload) => {
                          if (payload?.membership) {
                            setMembershipState((current) =>
                              current.map((item) => (item.id === membership.id ? (payload.membership as MembershipRecord) : item))
                            );
                          }
                        });
                      }}
                    >
                      {membership.role === "viewer" ? "Сделать администратором" : "Сделать участником"}
                    </Button>
                    <Button
                      variant="destructive"
                      type="button"
                      onClick={async () => {
                        const payload = await runAction(fetch(`/api/members/${membership.id}`, { method: "DELETE" }));
                        if (payload !== null) {
                          setMembershipState((current) => current.filter((item) => item.id !== membership.id));
                        }
                      }}
                    >
                      Отозвать доступ
                    </Button>
                  </>
                ) : (
                  <span className="members-static-note">Владелец закреплен за деревом</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Card className="members-list-card utility-section-card p-6">
        <div className="members-section-heading utility-section-heading">
          <p className="eyebrow">Приглашения</p>
          <h2 className="card-heading">Что уже отправлено</h2>
          <p className="muted-copy">Здесь видны роль, способ отправки и текущее состояние каждого приглашения.</p>
        </div>
        <div className="members-context-row utility-context-row">
          <Badge className="meta-pill meta-pill-muted" variant="secondary">
            Всего: {invites.length}
          </Badge>
          <Badge className="meta-pill meta-pill-muted" variant="secondary">
            Ожидают: {pendingInvites.length}
          </Badge>
          <Badge className="meta-pill meta-pill-muted" variant="secondary">
            Приняты: {acceptedInvites.length}
          </Badge>
        </div>
        <div className="members-card-list utility-entry-list">
          {inviteState.length ? (
            inviteState.map((invite) => (
              <article key={invite.id} className="members-entry-card utility-entry-card">
                <div className="members-entry-topline">
                  <div className="meta-row meta-row-tight">
                    <Badge className="meta-pill">{formatRole(invite.role)}</Badge>
                    <Badge className="meta-pill meta-pill-muted" variant="secondary">
                      {formatInviteMethod(invite.invite_method)}
                    </Badge>
                  </div>
                  <span className={invite.accepted_at ? "members-invite-status members-invite-status-accepted" : "members-invite-status"}>
                    {invite.accepted_at ? "Принято" : "Ожидает"}
                  </span>
                </div>
                <div className="members-entry-copy">
                  <strong>{invite.email || "Приглашение только по защищенной ссылке"}</strong>
                  <p>{invite.accepted_at ? `Принято ${formatDateTime(invite.accepted_at)}.` : `Истекает ${formatDateTime(invite.expires_at)}.`}</p>
                </div>
                <div className="action-row members-entry-actions">
                  {!invite.accepted_at ? (
                    <>
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={async () => {
                          await reissueInvite(invite);
                        }}
                      >
                        Создать заново
                      </Button>
                      <Button
                        variant="destructive"
                        type="button"
                        onClick={async () => {
                          const payload = await runAction(fetch(`/api/invites/${invite.id}`, { method: "DELETE" }));
                          if (payload !== null) {
                            setInviteState((current) => current.filter((item) => item.id !== invite.id));
                          }
                        }}
                      >
                        Отозвать приглашение
                      </Button>
                    </>
                  ) : (
                    <span className="members-static-note">Принятое приглашение уже превратилось в доступ участника</span>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">Приглашения еще не создавались.</div>
          )}
        </div>
        {acceptedInvites.length ? (
          <p className="members-footnote utility-footnote">Принятых приглашений: {acceptedInvites.length}. Активный доступ после принятия уже отражается в списке участников.</p>
        ) : null}
      </Card>

      <Card className="members-list-card utility-section-card p-6">
        <div className="members-section-heading utility-section-heading">
          <p className="eyebrow">Семейные ссылки</p>
          <h2 className="card-heading">Ссылки для семейного просмотра</h2>
          <p className="muted-copy">Эти ссылки не выдают роль в дереве и подходят только для просмотра. При необходимости их можно в любой момент отозвать.</p>
        </div>
        <div className="members-context-row utility-context-row">
          <Badge className="meta-pill meta-pill-muted" variant="secondary">
            Активны: {activeShareLinks.length}
          </Badge>
          <Badge className="meta-pill meta-pill-muted" variant="secondary">
            Всего: {shareLinks.length}
          </Badge>
        </div>
        <div className="members-card-list utility-entry-list">
          {shareLinkState.length ? (
            shareLinkState.map((shareLink) => (
              <article key={shareLink.id} className="members-entry-card utility-entry-card">
                {(() => {
                  const revealedUrl = revealedShareLinkUrls[shareLink.id] || null;
                  const revealMessage = shareLinkRevealMessages[shareLink.id] || null;

                  return (
                    <>
                <div className="members-entry-topline">
                  <div className="meta-row meta-row-tight">
                    <Badge className="meta-pill">Только просмотр</Badge>
                    <Badge className="meta-pill meta-pill-muted" variant="secondary">
                      {getShareLinkStatus(shareLink)}
                    </Badge>
                  </div>
                </div>
                <div className="members-entry-copy">
                  <strong>{shareLink.label}</strong>
                  <p>
                    {shareLink.revoked_at
                      ? `Отозвана ${formatDateTime(shareLink.revoked_at)}.`
                      : `Действует до ${formatDateTime(shareLink.expires_at)}.`}
                  </p>
                  {shareLink.last_accessed_at ? <p>Последний просмотр: {formatDateTime(shareLink.last_accessed_at)}.</p> : null}
                  {revealedUrl ? <p>{revealedUrl}</p> : null}
                  {revealMessage ? <p>{revealMessage}</p> : null}
                </div>
                <div className="action-row members-entry-actions">
                  {!shareLink.revoked_at ? (
                    <>
                      <Button
                        variant="ghost"
                        type="button"
                        disabled={revealingShareLinkId === shareLink.id}
                        onClick={async () => {
                          await revealStoredShareLink(shareLink);
                        }}
                      >
                        {revealingShareLinkId === shareLink.id ? "Показываю..." : "Показать ссылку"}
                      </Button>
                      {revealedUrl ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={async () => {
                            await copyText(revealedUrl, "Семейная ссылка скопирована.");
                          }}
                        >
                          Скопировать
                        </Button>
                      ) : null}
                      {revealMessage ? (
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={async () => {
                            await reissueShareLink(shareLink);
                          }}
                        >
                          Создать новую ссылку
                        </Button>
                      ) : null}
                      <Button
                        variant="destructive"
                        type="button"
                        onClick={async () => {
                          const payload = await runAction(fetch(`/api/share-links/${shareLink.id}`, { method: "DELETE" }));
                          setRevealedShareLinkUrls((current) => {
                            const nextState = { ...current };
                            delete nextState[shareLink.id];
                            return nextState;
                          });
                          setShareLinkRevealMessages((current) => {
                            const nextState = { ...current };
                            delete nextState[shareLink.id];
                            return nextState;
                          });
                          if (payload?.shareLink) {
                            const revokedShareLink = payload.shareLink as ShareLinkRecord;
                            setShareLinkState((current) =>
                              current.map((item) => (item.id === shareLink.id ? revokedShareLink : item))
                            );
                          } else if (payload !== null) {
                            setShareLinkState((current) =>
                              current.map((item) =>
                                item.id === shareLink.id ? { ...item, revoked_at: new Date().toISOString() } : item
                              )
                            );
                          }
                        }}
                      >
                        Отозвать ссылку
                      </Button>
                    </>
                  ) : (
                    <div className="action-row members-entry-actions">
                      <span className="members-static-note">Ссылка больше не действует</span>
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={async () => {
                          await reissueShareLink(shareLink);
                        }}
                      >
                        Создать новую ссылку
                      </Button>
                    </div>
                  )}
                </div>
                    </>
                  );
                })()}
              </article>
            ))
          ) : (
            <div className="empty-state">Ссылки для семейного просмотра еще не создавались.</div>
          )}
        </div>
        <p className="members-footnote utility-footnote">Для новых ссылок адрес можно показать повторно. Для старых ссылок без защищенного хранения адреса может понадобиться перевыпуск.</p>
      </Card>
    </div>
  );
}
