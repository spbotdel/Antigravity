import { describe, expect, it } from "vitest";

import { buildViewerActor, canSeeMedia, canViewTree, hasRequiredRole } from "@/lib/permissions";

describe("permissions", () => {
  it("allows public trees for anonymous viewers", () => {
    expect(canViewTree("public", null)).toBe(true);
    expect(canViewTree("private", null)).toBe(false);
  });

  it("maps actor capabilities by role", () => {
    const owner = buildViewerActor("u1", "owner");
    const viewer = buildViewerActor("u2", "viewer");

    expect(owner.canManageSettings).toBe(true);
    expect(owner.canReadAudit).toBe(true);
    expect(viewer.canEdit).toBe(false);
    expect(viewer.canManageMembers).toBe(false);
  });

  it("checks role membership and media visibility", () => {
    expect(hasRequiredRole("admin", ["owner", "admin"])).toBe(true);
    expect(hasRequiredRole("viewer", ["owner", "admin"])).toBe(false);
    expect(canSeeMedia(null, "public")).toBe(true);
    expect(canSeeMedia(null, "members")).toBe(false);
    expect(canSeeMedia("viewer", "members")).toBe(true);
  });
});
