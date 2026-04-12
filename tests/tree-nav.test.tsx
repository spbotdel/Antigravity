import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TreeNav } from "@/components/layout/tree-nav";

const replaceSpy = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/tree/demo-tree/media",
  useRouter: () => ({
    replace: replaceSpy,
  }),
}));

describe("tree nav", () => {
  it("routes the top media nav item to the ordinary archive root state", () => {
    render(
      <TreeNav
        slug="demo-tree"
        shareToken={null}
        canEdit
        canManageMembers
        canReadAudit
        canManageSettings
      />
    );

    expect(screen.getByRole("link", { name: "Медиа" })).toHaveAttribute("href", "/tree/demo-tree/media");
  });

  it("preserves share token while resetting media state", () => {
    render(
      <TreeNav
        slug="demo-tree"
        shareToken="family-token"
        canEdit
        canManageMembers
        canReadAudit
        canManageSettings
      />
    );

    expect(screen.getByRole("link", { name: "Медиа" })).toHaveAttribute("href", "/tree/demo-tree/media?share=family-token");
  });

  it("uses replace navigation for the media reset entry", () => {
    replaceSpy.mockClear();

    render(
      <TreeNav
        slug="demo-tree"
        shareToken={null}
        canEdit
        canManageMembers
        canReadAudit
        canManageSettings
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Медиа" }));

    expect(replaceSpy).toHaveBeenCalledWith("/tree/demo-tree/media");
  });
});
