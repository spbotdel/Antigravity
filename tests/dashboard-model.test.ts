import { describe, expect, it } from "vitest";

import { buildDashboardModel } from "@/components/dashboard/dashboard-model";
import type { MembershipRecord, TreeRecord, UserRole } from "@/lib/types";

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

describe("dashboard model", () => {
  it("builds the empty state when there are no trees", () => {
    const model = buildDashboardModel([]);

    expect(model.dashboardState).toBe("empty");
    expect(model.primaryOwnedItem).toBeNull();
    expect(model.ownedItems).toHaveLength(0);
    expect(model.invitedItems).toHaveLength(0);
    expect(model.canCreateOwnedTree).toBe(true);
  });

  it("builds the owned state when the user has one owned tree", () => {
    const model = buildDashboardModel([createItem("tree-owned", "owner")]);

    expect(model.dashboardState).toBe("owned");
    expect(model.primaryOwnedItem?.tree.id).toBe("tree-owned");
    expect(model.ownedItems).toHaveLength(1);
    expect(model.invitedItems).toHaveLength(0);
    expect(model.canCreateOwnedTree).toBe(false);
  });

  it("keeps owned primary and invited trees secondary", () => {
    const model = buildDashboardModel([createItem("tree-owned", "owner"), createItem("tree-invite", "admin")]);

    expect(model.dashboardState).toBe("owned");
    expect(model.primaryOwnedItem?.tree.id).toBe("tree-owned");
    expect(model.secondaryItems).toHaveLength(1);
    expect(model.secondaryItems[0]?.tree.id).toBe("tree-invite");
    expect(model.invitedItems).toHaveLength(1);
    expect(model.canCreateOwnedTree).toBe(false);
  });

  it("keeps invited-only users able to create their first owned tree", () => {
    const model = buildDashboardModel([createItem("tree-invite", "viewer")]);

    expect(model.dashboardState).toBe("invited_only");
    expect(model.primaryOwnedItem).toBeNull();
    expect(model.invitedItems).toHaveLength(1);
    expect(model.canCreateOwnedTree).toBe(true);
  });
});
