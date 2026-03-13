import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TreeSettingsForm } from "@/components/settings/tree-settings-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe("tree settings form", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("shows the full tree URL and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <TreeSettingsForm
        tree={{
          id: "tree-1",
          owner_user_id: "user-owner",
          slug: "demo-family",
          title: "Demo Family",
          description: null,
          visibility: "private",
          root_person_id: null,
          created_at: "2026-03-09T00:00:00.000Z",
          updated_at: "2026-03-09T00:00:00.000Z",
        }}
        people={[]}
        initialBaseUrl="http://localhost:3000"
      />
    );

    expect(screen.getByText("http://localhost:3000/tree/demo-family")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Скопировать ссылку" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/tree/demo-family");
    });

    expect(screen.getByText("Ссылка на дерево скопирована.")).toBeInTheDocument();
  });
});
