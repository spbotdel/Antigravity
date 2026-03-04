import type { MembershipRecord, TreeVisibility, UserRole, ViewerActor } from "@/lib/types";

export function canViewTree(treeVisibility: TreeVisibility, membership: MembershipRecord | null) {
  return treeVisibility === "public" || Boolean(membership && membership.status === "active");
}

export function buildViewerActor(userId: string | null, role: UserRole | null): ViewerActor {
  const isAuthenticated = Boolean(userId);
  const canEdit = role === "owner" || role === "admin";
  const canManageMembers = role === "owner" || role === "admin";
  const canManageSettings = role === "owner";
  const canReadAudit = role === "owner";

  return {
    userId,
    role,
    isAuthenticated,
    canEdit,
    canManageMembers,
    canManageSettings,
    canReadAudit
  };
}

export function hasRequiredRole(role: UserRole | null, allowedRoles: UserRole[]) {
  return role !== null && allowedRoles.includes(role);
}

export function canSeeMedia(role: UserRole | null, visibility: "public" | "members") {
  return visibility === "public" || role !== null;
}
