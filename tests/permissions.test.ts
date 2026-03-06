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
    const shareViewer = buildViewerActor(null, null, { accessSource: "share_link", shareLinkId: "share-1" });

    expect(owner.canManageSettings).toBe(true);
    expect(owner.canReadAudit).toBe(true);
    expect(viewer.canEdit).toBe(false);
    expect(viewer.canManageMembers).toBe(false);
    expect(shareViewer.canEdit).toBe(false);
    expect(shareViewer.accessSource).toBe("share_link");
    expect(shareViewer.shareLinkId).toBe("share-1");
  });

  it("checks role membership and media visibility", () => {
    expect(hasRequiredRole("admin", ["owner", "admin"])).toBe(true);
    expect(hasRequiredRole("viewer", ["owner", "admin"])).toBe(false);
    expect(canSeeMedia(null, "public")).toBe(true);
    expect(canSeeMedia(null, "members")).toBe(false);
    expect(canSeeMedia("viewer", "members")).toBe(true);
    expect(canSeeMedia(null, "members", true)).toBe(true);
    expect(canViewTree("private", null, true)).toBe(true);
  });
});
