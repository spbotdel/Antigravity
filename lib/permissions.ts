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

export function resolveTreeRole(input: {
  userId: string | null | undefined;
  treeOwnerUserId: string | null | undefined;
  membershipRole: UserRole | null | undefined;
}) {
  if (input.userId && input.treeOwnerUserId && input.userId === input.treeOwnerUserId) {
    return "owner" as const;
  }

  return input.membershipRole ?? null;
}

export function normalizeMembershipRole(membership: MembershipRecord, treeOwnerUserId: string | null | undefined): MembershipRecord {
  const effectiveRole = resolveTreeRole({
    userId: membership.user_id,
    treeOwnerUserId,
    membershipRole: membership.role
  });

  if (!effectiveRole || effectiveRole === membership.role) {
    return membership;
  }

  return {
    ...membership,
    role: effectiveRole
  };
}

export function hasRequiredRole(role: UserRole | null, allowedRoles: UserRole[]) {
  return role !== null && allowedRoles.includes(role);
}

export function canSeeMedia(role: UserRole | null, visibility: "public" | "members", hasShareLinkAccess = false) {
  return visibility === "public" || role !== null || hasShareLinkAccess;
}
