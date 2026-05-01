import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TreeSettingsForm } from "@/components/settings/tree-settings-form";
import type { PersonRecord, TreeRecord } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe("tree settings form", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/tree/demo-family/settings");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  function createTree(overrides: Partial<TreeRecord> = {}): TreeRecord {
    return {
      id: "tree-1",
      owner_user_id: "user-owner",
      slug: "demo-family",
      title: "Demo Family",
      description: "Initial description",
      visibility: "private",
      root_person_id: null,
      created_at: "2026-03-09T00:00:00.000Z",
      updated_at: "2026-03-09T00:00:00.000Z",
      ...overrides,
    };
  }

  function createPerson(overrides: Partial<PersonRecord> = {}): PersonRecord {
    return {
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
      ...overrides,
    };
  }

  it("shows the full tree URL and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <TreeSettingsForm
        tree={createTree({ description: null })}
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

  it("uses a clean copied tree URL on clean family-domain paths", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.history.pushState({}, "", "/settings");

    render(
      <TreeSettingsForm
        tree={createTree()}
        people={[]}
        initialBaseUrl="https://popovi.ru"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(`${window.location.origin}/`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Скопировать ссылку" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/`);
    });
  });

  it("hides tree metadata controls and keeps editable settings visible", () => {
    render(
      <TreeSettingsForm
        tree={createTree()}
        people={[createPerson()]}
        initialBaseUrl="http://localhost:3000"
      />
    );

    expect(screen.queryByLabelText("Название дерева")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Адрес страницы")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Описание")).not.toBeInTheDocument();
    expect(screen.getByText("Корневой человек")).toBeInTheDocument();
    expect(screen.getByText("Сделать закрытым")).toBeInTheDocument();
    expect(screen.getByText("Сделать открытым")).toBeInTheDocument();
  });

  it("saves only the root person payload from settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Настройки сохранены." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TreeSettingsForm
        tree={createTree({
          description: "Hidden metadata must stay unchanged",
          root_person_id: null,
          slug: "demo-family",
          title: "Hidden title",
        })}
        people={[createPerson()]}
        initialBaseUrl="http://localhost:3000"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить данные" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trees/tree-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ rootPersonId: null }),
        })
      );
    });

    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(init.body));
    expect(payload).not.toHaveProperty("title");
    expect(payload).not.toHaveProperty("slug");
    expect(payload).not.toHaveProperty("description");
  });

  it("rerenders updated tree fields without the uncontrolled FieldControl warning", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <TreeSettingsForm
        tree={createTree({ root_person_id: "person-1" })}
        people={[createPerson()]}
        initialBaseUrl="http://localhost:3000"
      />
    );

    rerender(
      <TreeSettingsForm
        tree={createTree({
          slug: "popovi",
          title: "Семейное дерево Ивановых",
          description: "Updated description",
          root_person_id: "person-1",
          updated_at: "2026-04-05T00:00:00.000Z",
        })}
        people={[createPerson()]}
        initialBaseUrl="http://localhost:3000"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("Иван Иванов").length).toBeGreaterThan(0);
      expect(screen.queryByDisplayValue("Семейное дерево Ивановых")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("popovi")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("Updated description")).not.toBeInTheDocument();
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
