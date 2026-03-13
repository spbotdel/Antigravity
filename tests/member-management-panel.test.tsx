import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemberManagementPanel } from "@/components/members/member-management-panel";
import type { InviteRecord, MembershipRecord, ShareLinkRecord, TreeRecord } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({}),
}));

function createTree(): TreeRecord {
  return {
    id: "tree-1",
    owner_user_id: "user-owner",
    slug: "demo-family",
    title: "Demo Family",
    description: null,
    visibility: "private",
    root_person_id: null,
    created_at: "2026-03-09T00:00:00.000Z",
    updated_at: "2026-03-09T00:00:00.000Z",
  };
}

function createMembership(role: MembershipRecord["role"]): MembershipRecord {
  return {
    id: `membership-${role}`,
    tree_id: "tree-1",
    user_id: `user-${role}`,
    role,
    status: "active",
    created_at: "2026-03-09T00:00:00.000Z",
  };
}

function createInvite(overrides: Partial<InviteRecord>): InviteRecord {
  return {
    id: "invite-1",
    tree_id: "tree-1",
    email: "pending@example.com",
    role: "viewer",
    invite_method: "link",
    token_hash: "hash",
    expires_at: "2026-03-20T12:00:00.000Z",
    accepted_at: null,
    created_by: "user-owner",
    created_at: "2026-03-09T00:00:00.000Z",
    ...overrides,
  };
}

function createShareLink(overrides: Partial<ShareLinkRecord>): ShareLinkRecord {
  return {
    id: "share-1",
    tree_id: "tree-1",
    label: "Семейная ссылка",
    token_hash: "hash",
    expires_at: "2026-03-20T12:00:00.000Z",
    revoked_at: null,
    last_accessed_at: null,
    created_by: "user-owner",
    created_at: "2026-03-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("member management panel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("shows revoke action only for pending invites and calls the revoke route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Приглашение отозвано." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemberManagementPanel
        tree={createTree()}
        memberships={[createMembership("owner")]}
        invites={[
          createInvite({ id: "invite-pending", email: "pending@example.com", accepted_at: null }),
          createInvite({ id: "invite-accepted", email: "accepted@example.com", accepted_at: "2026-03-10T12:00:00.000Z" }),
        ]}
        shareLinks={[] satisfies ShareLinkRecord[]}
      />,
    );

    const pendingCard = screen.getByText("pending@example.com").closest(".members-entry-card");
    const acceptedCard = screen.getByText("accepted@example.com").closest(".members-entry-card");

    expect(pendingCard).not.toBeNull();
    expect(acceptedCard).not.toBeNull();
    expect(within(pendingCard as HTMLElement).getByRole("button", { name: "Отозвать приглашение" })).toBeInTheDocument();
    expect(within(acceptedCard as HTMLElement).queryByRole("button", { name: "Отозвать приглашение" })).not.toBeInTheDocument();

    fireEvent.click(within(pendingCard as HTMLElement).getByRole("button", { name: "Отозвать приглашение" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/invites/invite-pending", { method: "DELETE" });
    });

    await waitFor(() => {
      expect(screen.queryByText("pending@example.com")).not.toBeInTheDocument();
    });
  });

  it("reissues a pending invite and exposes the fresh link", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "http://localhost:3000/auth/accept-invite?token=fresh-token", deliveryMessage: "Письмо отправлено на pending@example.com." }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Приглашение отозвано." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemberManagementPanel
        tree={createTree()}
        memberships={[createMembership("owner")]}
        invites={[createInvite({ id: "invite-pending", email: "pending@example.com", accepted_at: null, role: "admin" })]}
        shareLinks={[] satisfies ShareLinkRecord[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Создать заново" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "/api/invites",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/invites/invite-pending", { method: "DELETE" });
    });

    expect(screen.getByText("http://localhost:3000/auth/accept-invite?token=fresh-token")).toBeInTheDocument();
    expect(screen.getByText("Письмо отправлено на pending@example.com.")).toBeInTheDocument();
    expect(screen.queryByText("pending@example.com")).not.toBeInTheDocument();
  });

  it("reveals an active share link and then copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          canReveal: true,
          url: "http://localhost:3000/tree/demo-family?share=fresh-share",
          message: "Семейная ссылка загружена.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemberManagementPanel
        tree={createTree()}
        memberships={[createMembership("owner")]}
        invites={[]}
        shareLinks={[createShareLink({ id: "share-active", label: "Родные из РФ" })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать ссылку" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/share-links/share-active");
    });

    expect(screen.getByText("http://localhost:3000/tree/demo-family?share=fresh-share")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Скопировать" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/tree/demo-family?share=fresh-share");
    });

    expect(screen.getByText("Семейная ссылка скопирована.")).toBeInTheDocument();
  });

  it("reissues a revoked share link without calling the revoke route again", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "http://localhost:3000/tree/demo-family?share=fresh-share" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemberManagementPanel
        tree={createTree()}
        memberships={[createMembership("owner")]}
        invites={[]}
        shareLinks={[
          createShareLink({
            id: "share-revoked",
            label: "Старая ссылка",
            revoked_at: "2026-03-10T12:00:00.000Z",
          }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Создать новую ссылку" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/share-links",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    expect(
      JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body as string),
    ).toMatchObject({
      treeId: "tree-1",
      treeSlug: "demo-family",
      label: "Старая ссылка",
    });

    expect(screen.getByText("http://localhost:3000/tree/demo-family?share=fresh-share")).toBeInTheDocument();
  });

  it("shows a legacy fallback message when an older share link cannot be revealed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          canReveal: false,
          url: null,
          message: "Эту ссылку нельзя показать повторно: она создана до включения защищенного хранения адреса.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemberManagementPanel
        tree={createTree()}
        memberships={[createMembership("owner")]}
        invites={[]}
        shareLinks={[createShareLink({ id: "share-legacy", label: "Старая ссылка" })]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Показать ссылку" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/share-links/share-legacy");
    });

    expect(screen.getByText("Эту ссылку нельзя показать повторно: она создана до включения защищенного хранения адреса.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать новую ссылку" })).toBeInTheDocument();
  });

  it("copies a freshly created invite link to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "http://localhost:3000/auth/accept-invite?token=fresh-token", deliveryMessage: "Письмо отправлено на viewer@example.com." }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <MemberManagementPanel
        tree={createTree()}
        memberships={[createMembership("owner")]}
        invites={[]}
        shareLinks={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Создать приглашение" }));
    await screen.findByText("http://localhost:3000/auth/accept-invite?token=fresh-token");
    fireEvent.click(screen.getByRole("button", { name: "Скопировать ссылку" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/auth/accept-invite?token=fresh-token");
    });

    expect(screen.getByText("Ссылка приглашения скопирована.")).toBeInTheDocument();
    expect(screen.getByText("Письмо отправлено на viewer@example.com.")).toBeInTheDocument();
    expect(screen.queryByText("Не удалось скопировать ссылку автоматически. Скопируйте ее вручную.")).not.toBeInTheDocument();
  });

  it("shows a copy error and clears the previous success message when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <MemberManagementPanel
        tree={createTree()}
        memberships={[createMembership("owner")]}
        invites={[createInvite({ id: "invite-pending", email: "pending@example.com", accepted_at: null, role: "admin" })]}
        shareLinks={[]}
      />
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "http://localhost:3000/auth/accept-invite?token=fresh-token" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Приглашение отозвано." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.click(screen.getByRole("button", { name: "Создать заново" }));

    await screen.findByText("http://localhost:3000/auth/accept-invite?token=fresh-token");
    fireEvent.click(screen.getByRole("button", { name: "Скопировать ссылку" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/auth/accept-invite?token=fresh-token");
    });

    expect(screen.getAllByText("Не удалось скопировать ссылку автоматически. Скопируйте ее вручную.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ссылка приглашения скопирована.")).not.toBeInTheDocument();
  });

  it("copies a freshly created share link to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "http://localhost:3000/tree/demo-family?share=fresh-share" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <MemberManagementPanel
        tree={createTree()}
        memberships={[createMembership("owner")]}
        invites={[]}
        shareLinks={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку для просмотра" }));
    await screen.findByText("http://localhost:3000/tree/demo-family?share=fresh-share");
    fireEvent.click(screen.getByRole("button", { name: "Скопировать ссылку" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/share-links",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treeId: "tree-1",
          treeSlug: "demo-family",
          label: "",
          expiresInDays: 14,
        }),
      }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/tree/demo-family?share=fresh-share");
    });

    expect(screen.getByText("Семейная ссылка скопирована.")).toBeInTheDocument();
    expect(screen.queryByText("Не удалось скопировать ссылку автоматически. Скопируйте ее вручную.")).not.toBeInTheDocument();
  });
});
