import type { MembershipRecord, TreeVisibility, UserRole, ViewerAccessSource, ViewerActor } from "@/lib/types";

export function canViewTree(treeVisibility: TreeVisibility, membership: MembershipRecord | null, hasShareLinkAccess = false) {
  return treeVisibility === "public" || hasShareLinkAccess || Boolean(membership && membership.status === "active");
}

export function buildViewerActor(
  userId: string | null,
  role: UserRole | null,
  options?: { accessSource?: ViewerAccessSource; shareLinkId?: string | null }
): ViewerActor {
  const isAuthenticated = Boolean(userId);
  const canEdit = role === "owner" || role === "admin";
  const canManageMembers = role === "owner" || role === "admin";
  const canManageSettings = role === "owner";
  const canReadAudit = role === "owner";
  const accessSource = options?.accessSource || (role ? "membership" : "anonymous");

  return {
    userId,
    role,
    isAuthenticated,
    accessSource,
    shareLinkId: options?.shareLinkId || null,
    canEdit,
    canManageMembers,
    canManageSettings,
    canReadAudit
  };
}

export function hasRequiredRole(role: UserRole | null, allowedRoles: UserRole[]) {
  return role !== null && allowedRoles.includes(role);
}

export function canSeeMedia(role: UserRole | null, visibility: "public" | "members", hasShareLinkAccess = false) {
  return visibility === "public" || role !== null || hasShareLinkAccess;
}
