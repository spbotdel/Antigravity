import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildDashboardModel } from "@/components/dashboard/dashboard-model";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import type { MembershipRecord, TreeRecord, UserRole } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

vi.mock("@/components/dashboard/create-tree-form", () => ({
  CreateTreeForm: ({ submitLabel }: { submitLabel?: string }) => <div data-testid="create-tree-form">{submitLabel}</div>
}));

function createTree(id: string, slug = id): TreeRecord {
  return {
    id,
    owner_user_id: `owner-${id}`,
    slug,
    title: `Tree ${id}`,
    description: `Description ${id}`,
    visibility: "private",
    root_person_id: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z"
  };
}

function createMembership(id: string, treeId: string, role: UserRole): MembershipRecord {
  return {
    id,
    tree_id: treeId,
    user_id: `user-${id}`,
    role,
    status: "active",
    created_at: "2026-03-02T00:00:00.000Z"
  };
}

function createItem(treeId: string, role: UserRole) {
  return {
    membership: createMembership(`membership-${treeId}-${role}`, treeId, role),
    tree: createTree(treeId, `slug-${treeId}`)
  };
}

describe("dashboard overview", () => {
  it("shows primary owned actions when the user owns a tree", () => {
    const dashboard = buildDashboardModel([createItem("tree-owned", "owner")]);

    render(<DashboardOverview dashboard={dashboard} />);

    expect(screen.getByRole("link", { name: "Продолжить редактирование" })).toHaveAttribute("href", "/tree/slug-tree-owned/builder");
    expect(screen.getByRole("link", { name: "Открыть дерево" })).toHaveAttribute("href", "/tree/slug-tree-owned");
  });

  it("shows edit and open actions for invited admin trees", () => {
    const dashboard = buildDashboardModel([createItem("tree-admin", "admin")]);

    render(<DashboardOverview dashboard={dashboard} />);

    expect(screen.getByRole("link", { name: "Редактировать дерево" })).toHaveAttribute("href", "/tree/slug-tree-admin/builder");
    expect(screen.getByRole("link", { name: "Открыть дерево" })).toHaveAttribute("href", "/tree/slug-tree-admin");
  });

  it("shows only open action for viewer trees", () => {
    const dashboard = buildDashboardModel([createItem("tree-viewer", "viewer")]);

    render(<DashboardOverview dashboard={dashboard} />);

    expect(screen.getByRole("link", { name: "Открыть дерево" })).toHaveAttribute("href", "/tree/slug-tree-viewer");
    expect(screen.queryByRole("link", { name: "Редактировать дерево" })).not.toBeInTheDocument();
  });

  it("shows invited trees together with the create panel for invited-only users", () => {
    const dashboard = buildDashboardModel([createItem("tree-invite", "viewer")]);

    render(<DashboardOverview dashboard={dashboard} />);

    expect(screen.getByRole("heading", { name: "Доступ по приглашениям" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Создайте свое дерево" })).toBeInTheDocument();
    expect(screen.getByTestId("create-tree-form")).toHaveTextContent("Создать свое дерево");
  });
});
