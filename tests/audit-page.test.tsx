import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuditPage from "@/app/tree/[slug]/audit/page";
import { AppError } from "@/lib/server/errors";

const mocks = vi.hoisted(() => ({
  getTreeAuditPageContext: vi.fn(),
  listAudit: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  })
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

vi.mock("@/components/layout/tree-nav", () => ({
  TreeNav: () => <div data-testid="tree-nav" />
}));

vi.mock("@/components/audit/audit-log-table", () => ({
  AuditLogTable: ({ total }: { total: number }) => <div data-testid="audit-log-table">total:{total}</div>
}));

vi.mock("@/lib/server/repository", () => ({
  getTreeAuditPageContext: mocks.getTreeAuditPageContext,
  listAudit: mocks.listAudit
}));

describe("audit page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads lightweight tree context before rendering audit entries", async () => {
    mocks.getTreeAuditPageContext.mockResolvedValue({
      tree: {
        id: "tree-1",
        owner_user_id: "user-1",
        slug: "demo-family",
        title: "Demo Family",
        description: null,
        visibility: "private",
        root_person_id: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z"
      },
      actor: {
        userId: "user-1",
        role: "owner",
        isAuthenticated: true,
        accessSource: "membership",
        shareLinkId: null,
        canEdit: true,
        canManageMembers: true,
        canManageSettings: true,
        canReadAudit: true
      }
    });
    mocks.listAudit.mockResolvedValue({
      entries: [],
      total: 12,
      page: 1,
      pageSize: 50
    });

    render(await AuditPage({ params: Promise.resolve({ slug: "demo-family" }), searchParams: Promise.resolve({}) }));

    expect(mocks.getTreeAuditPageContext).toHaveBeenCalledWith("demo-family", { shareToken: null });
    expect(mocks.listAudit).toHaveBeenCalledWith("tree-1", { page: 1, pageSize: 50 });
    expect(screen.getByRole("heading", { name: "Demo Family" })).toBeInTheDocument();
    expect(screen.getByTestId("audit-log-table")).toHaveTextContent("total:12");
  });

  it("redirects share-link viewers back to the tree viewer", async () => {
    mocks.getTreeAuditPageContext.mockResolvedValue({
      tree: {
        id: "tree-1",
        owner_user_id: "user-1",
        slug: "demo-family",
        title: "Demo Family",
        description: null,
        visibility: "private",
        root_person_id: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z"
      },
      actor: {
        userId: null,
        role: null,
        isAuthenticated: false,
        accessSource: "share_link",
        shareLinkId: "share-1",
        canEdit: false,
        canManageMembers: false,
        canManageSettings: false,
        canReadAudit: false
      }
    });

    await expect(
      AuditPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ share: "family-token" })
      })
    ).rejects.toThrow("redirect:/tree/demo-family?share=family-token");
  });

  it("redirects when the lightweight audit loader throws 403", async () => {
    mocks.getTreeAuditPageContext.mockRejectedValue(new AppError(403, "forbidden"));

    await expect(
      AuditPage({
        params: Promise.resolve({ slug: "demo-family" }),
        searchParams: Promise.resolve({ share: "family-token" })
      })
    ).rejects.toThrow("redirect:/tree/demo-family?share=family-token");
  });
});
