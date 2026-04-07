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

  it("rerenders updated tree fields without the uncontrolled FieldControl warning", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <TreeSettingsForm
        tree={{
          id: "tree-1",
          owner_user_id: "user-owner",
          slug: "demo-family",
          title: "Demo Family",
          description: "Initial description",
          visibility: "private",
          root_person_id: "person-1",
          created_at: "2026-03-09T00:00:00.000Z",
          updated_at: "2026-03-09T00:00:00.000Z",
        }}
        people={[
          {
            id: "person-1",
            tree_id: "tree-1",
            full_name: "Иван Иванов",
            gender: null,
            birth_date: null,
            death_date: null,
            birth_place: null,
            death_place: null,
            bio: null,
            is_living: true,
            created_by: null,
            created_at: "2026-03-09T00:00:00.000Z",
            updated_at: "2026-03-09T00:00:00.000Z",
          },
        ]}
        initialBaseUrl="http://localhost:3000"
      />
    );

    rerender(
      <TreeSettingsForm
        tree={{
          id: "tree-1",
          owner_user_id: "user-owner",
          slug: "popovi",
          title: "Семейное дерево Ивановых",
          description: "Updated description",
          visibility: "private",
          root_person_id: "person-1",
          created_at: "2026-03-09T00:00:00.000Z",
          updated_at: "2026-04-05T00:00:00.000Z",
        }}
        people={[
          {
            id: "person-1",
            tree_id: "tree-1",
            full_name: "Иван Иванов",
            gender: null,
            birth_date: null,
            death_date: null,
            birth_place: null,
            death_place: null,
            bio: null,
            is_living: true,
            created_by: null,
            created_at: "2026-03-09T00:00:00.000Z",
            updated_at: "2026-03-09T00:00:00.000Z",
          },
        ]}
        initialBaseUrl="http://localhost:3000"
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Семейное дерево Ивановых")).toBeInTheDocument();
      expect(screen.getByDisplayValue("popovi")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Updated description")).toBeInTheDocument();
    });

    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        call.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("changing the default value state of an uncontrolled FieldControl")
        )
      )
    ).toBe(false);
  });
});
