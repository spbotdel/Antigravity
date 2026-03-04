import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { FamilyTreeCanvas, selectPreferredCanvasItem } from "@/components/tree/family-tree-canvas";
import type { DisplayTreeNode } from "@/lib/types";

beforeAll(() => {
  if (!("getBBox" in SVGElement.prototype)) {
    Object.defineProperty(SVGElement.prototype, "getBBox", {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 420, height: 240 })
    });
  }
});

describe("family tree canvas helpers", () => {
  it("prefers a person node over a couple node for the same selected person", () => {
    const personNode = { type: "person" as const, id: "person-1" };
    const coupleNode = { type: "couple" as const, primaryId: "person-1" };

    const selected = selectPreferredCanvasItem([coupleNode, personNode], "person-1", (item) => item);

    expect(selected).toBe(personNode);
  });

  it("matches a couple node when the selected person is the spouse", () => {
    const coupleNode = { type: "couple" as const, primaryId: "person-1", spouseId: "person-2" };

    const selected = selectPreferredCanvasItem([coupleNode], "person-2", (item) => item);

    expect(selected).toBe(coupleNode);
  });
});

describe("family tree canvas interactions", () => {
  it("opens and closes the create menu from the selected node", async () => {
    const tree: DisplayTreeNode = {
      type: "person",
      id: "person-1",
      name: "Maria Ivanova",
      gender: "female",
      birthDate: "1990-01-01",
      deathDate: null,
      children: []
    };

    render(<FamilyTreeCanvas tree={tree} selectedPersonId="person-1" onSelectPerson={vi.fn()} interactive onNodeAction={vi.fn()} />);

    const plusButton = await screen.findByRole("button", { name: "Открыть меню добавления связи" });
    fireEvent.click(plusButton);

    expect(await screen.findByRole("button", { name: "Добавить ребенка" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Добавить ребенка" })).not.toBeInTheDocument();
    });
  });

  it("does not offer add-partner or delete from a couple card", async () => {
    const tree: DisplayTreeNode = {
      type: "couple",
      primaryId: "person-1",
      spouseId: "person-2",
      partnershipId: "partnership-1",
      name: "Maria Ivanova",
      spouseName: "Petr Ivanov",
      gender: "female",
      spouseGender: "male",
      birthDate: "1990-01-01",
      deathDate: null,
      spouseBirthDate: "1989-01-01",
      spouseDeathDate: null,
      children: []
    };

    render(<FamilyTreeCanvas tree={tree} selectedPersonId="person-1" onSelectPerson={vi.fn()} interactive onNodeAction={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Открыть меню добавления связи" }));

    expect(await screen.findByRole("button", { name: "Добавить ребенка" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить партнера" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить выбранного человека" })).not.toBeInTheDocument();
  });

  it("closes the create menu on escape", async () => {
    const tree: DisplayTreeNode = {
      type: "person",
      id: "person-1",
      name: "Maria Ivanova",
      gender: "female",
      birthDate: "1990-01-01",
      deathDate: null,
      children: []
    };

    render(<FamilyTreeCanvas tree={tree} selectedPersonId="person-1" onSelectPerson={vi.fn()} interactive onNodeAction={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Открыть меню добавления связи" }));
    expect(await screen.findByRole("button", { name: "Добавить ребенка" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Добавить ребенка" })).not.toBeInTheDocument();
    });
  });

  it("dispatches selected node actions from the menu and delete button", async () => {
    const onNodeAction = vi.fn();
    const tree: DisplayTreeNode = {
      type: "person",
      id: "person-1",
      name: "Maria Ivanova",
      gender: "female",
      birthDate: "1990-01-01",
      deathDate: null,
      children: []
    };

    render(<FamilyTreeCanvas tree={tree} selectedPersonId="person-1" onSelectPerson={vi.fn()} interactive onNodeAction={onNodeAction} />);

    fireEvent.click(await screen.findByRole("button", { name: "Открыть меню добавления связи" }));
    fireEvent.click(await screen.findByRole("button", { name: "Добавить ребенка" }));

    expect(onNodeAction).toHaveBeenCalledWith("person-1", "add-child");

    fireEvent.click(screen.getByRole("button", { name: "Удалить выбранного человека" }));

    expect(onNodeAction).toHaveBeenCalledWith("person-1", "delete");
  });
});
