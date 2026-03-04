import type { MembershipRecord, TreeRecord } from "@/lib/types";

export interface DashboardTreeItem {
  membership: MembershipRecord;
  tree: TreeRecord;
}

export type DashboardState = "empty" | "owned" | "invited_only";

export interface DashboardModel {
  dashboardState: DashboardState;
  ownedItems: DashboardTreeItem[];
  invitedItems: DashboardTreeItem[];
  primaryOwnedItem: DashboardTreeItem | null;
  secondaryItems: DashboardTreeItem[];
  canCreateOwnedTree: boolean;
}

export function buildDashboardModel(items: DashboardTreeItem[]): DashboardModel {
  const ownedItems = items.filter((item) => item.membership.role === "owner");
  const invitedItems = items.filter((item) => item.membership.role === "admin" || item.membership.role === "viewer");
  const primaryOwnedItem = ownedItems[0] ?? null;
  const secondaryItems = [...ownedItems.slice(1), ...invitedItems];
  const canCreateOwnedTree = ownedItems.length === 0;

  let dashboardState: DashboardState = "empty";
  if (primaryOwnedItem) {
    dashboardState = "owned";
  } else if (invitedItems.length > 0) {
    dashboardState = "invited_only";
  }

  return {
    dashboardState,
    ownedItems,
    invitedItems,
    primaryOwnedItem,
    secondaryItems,
    canCreateOwnedTree
  };
}
