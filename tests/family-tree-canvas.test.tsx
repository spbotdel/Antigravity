import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { FamilyTreeCanvas, selectPreferredCanvasItem } from "@/components/tree/family-tree-canvas";
import type { DisplayTreeNode, ParentLinkRecord, PartnershipRecord, PersonRecord } from "@/lib/types";

function parseTranslate(value: string | null) {
  const match = value?.match(/translate\(([-\d.]+),([-\d.]+)\)/);
  if (!match) {
    return null;
  }

  return {
    x: Number(match[1]),
    y: Number(match[2])
  };
}

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

  it("renders an optimistic preview card as a normal person card while a related person is being created", async () => {
    const tree: DisplayTreeNode = {
      type: "person",
      id: "person-1",
      name: "Maria Ivanova",
      gender: "female",
      birthDate: "1990-01-01",
      deathDate: null,
      children: []
    };

    const { container } = render(
      <FamilyTreeCanvas
        tree={tree}
        selectedPersonId="person-1"
        onSelectPerson={vi.fn()}
        interactive
        onNodeAction={vi.fn()}
        createPreview={{
          relationType: "child",
          anchorPersonId: "person-1",
          title: "Новый ребенок"
        }}
      />
    );

    expect(screen.getAllByText("Новый ребенок").length).toBeGreaterThan(0);
    expect(screen.getByText("Человек")).toBeInTheDocument();
    expect(screen.getByText("Даты не указаны")).toBeInTheDocument();
    expect(container.querySelector(".tree-card-preview")).not.toBeNull();
  });

  it("anchors builder partners below the person and keeps two parents separated on the left", async () => {
    const tree: DisplayTreeNode = {
      type: "person",
      id: "root",
      name: "Root",
      gender: "male",
      birthDate: "1990-01-01",
      deathDate: null,
      children: [
        {
          type: "person",
          id: "child",
          name: "Child",
          gender: "female",
          birthDate: "2010-01-01",
          deathDate: null,
          children: []
        }
      ]
    };
    const people: PersonRecord[] = [
      {
        id: "root",
        tree_id: "tree-1",
        full_name: "Root",
        gender: "male",
        birth_date: "1990-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "child",
        tree_id: "tree-1",
        full_name: "Child",
        gender: "female",
        birth_date: "2010-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "partner",
        tree_id: "tree-1",
        full_name: "Partner",
        gender: "female",
        birth_date: "1991-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "parent",
        tree_id: "tree-1",
        full_name: "Parent",
        gender: "female",
        birth_date: "1970-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "parent-2",
        tree_id: "tree-1",
        full_name: "Parent Two",
        gender: "male",
        birth_date: "1969-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    const parentLinks: ParentLinkRecord[] = [
      {
        id: "link-1",
        tree_id: "tree-1",
        parent_person_id: "root",
        child_person_id: "child",
        relation_type: "biological",
        created_at: new Date().toISOString()
      },
      {
        id: "link-2",
        tree_id: "tree-1",
        parent_person_id: "parent",
        child_person_id: "root",
        relation_type: "biological",
        created_at: new Date().toISOString()
      },
      {
        id: "link-3",
        tree_id: "tree-1",
        parent_person_id: "parent-2",
        child_person_id: "root",
        relation_type: "biological",
        created_at: new Date().toISOString()
      }
    ];
    const partnerships: PartnershipRecord[] = [
      {
        id: "partnership-1",
        tree_id: "tree-1",
        person_a_id: "root",
        person_b_id: "partner",
        status: "partner",
        start_date: null,
        end_date: null,
        created_at: new Date().toISOString()
      }
    ];

    render(
      <FamilyTreeCanvas
        tree={tree}
        selectedPersonId="root"
        onSelectPerson={vi.fn()}
        displayMode="builder"
        people={people}
        parentLinks={parentLinks}
        partnerships={partnerships}
      />
    );

    const rootTransform = parseTranslate(screen.getByText("Root").closest("g")?.getAttribute("transform") || null);
    const partnerTransform = parseTranslate(screen.getByText("Partner").closest("g")?.getAttribute("transform") || null);
    const parentTransform = parseTranslate(screen.getByText("Parent").closest("g")?.getAttribute("transform") || null);
    const secondParentTransform = parseTranslate(screen.getByText("Parent Two").closest("g")?.getAttribute("transform") || null);

    expect(rootTransform).not.toBeNull();
    expect(partnerTransform).not.toBeNull();
    expect(parentTransform).not.toBeNull();
    expect(secondParentTransform).not.toBeNull();

    expect(partnerTransform?.x).toBe(rootTransform?.x);
    expect(partnerTransform?.y).toBeGreaterThan(rootTransform?.y ?? 0);
    expect(parentTransform?.x).toBeLessThan(rootTransform?.x ?? 0);
    expect(secondParentTransform?.x).toBeLessThan(rootTransform?.x ?? 0);
    expect(secondParentTransform?.y).not.toBe(parentTransform?.y);
  });

  it("places a visible partner into a free slot instead of overlapping a sibling in the same column", () => {
    const tree: DisplayTreeNode = {
      type: "person",
      id: "root",
      name: "Root",
      gender: "male",
      birthDate: "1990-01-01",
      deathDate: null,
      children: [
        {
          type: "person",
          id: "child-top",
          name: "Child Top",
          gender: "female",
          birthDate: "2010-01-01",
          deathDate: null,
          children: []
        },
        {
          type: "person",
          id: "child-bottom",
          name: "Child Bottom",
          gender: "male",
          birthDate: "2012-01-01",
          deathDate: null,
          children: []
        }
      ]
    };
    const people: PersonRecord[] = [
      {
        id: "root",
        tree_id: "tree-1",
        full_name: "Root",
        gender: "male",
        birth_date: "1990-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "child-top",
        tree_id: "tree-1",
        full_name: "Child Top",
        gender: "female",
        birth_date: "2010-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "child-bottom",
        tree_id: "tree-1",
        full_name: "Child Bottom",
        gender: "male",
        birth_date: "2012-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "child-top-partner",
        tree_id: "tree-1",
        full_name: "Child Top Partner",
        gender: "male",
        birth_date: "2009-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    const parentLinks: ParentLinkRecord[] = [
      {
        id: "link-1",
        tree_id: "tree-1",
        parent_person_id: "root",
        child_person_id: "child-top",
        relation_type: "biological",
        created_at: new Date().toISOString()
      },
      {
        id: "link-2",
        tree_id: "tree-1",
        parent_person_id: "root",
        child_person_id: "child-bottom",
        relation_type: "biological",
        created_at: new Date().toISOString()
      }
    ];
    const partnerships: PartnershipRecord[] = [
      {
        id: "partnership-1",
        tree_id: "tree-1",
        person_a_id: "child-top",
        person_b_id: "child-top-partner",
        status: "partner",
        start_date: null,
        end_date: null,
        created_at: new Date().toISOString()
      }
    ];

    render(
      <FamilyTreeCanvas
        tree={tree}
        selectedPersonId="child-top-partner"
        onSelectPerson={vi.fn()}
        displayMode="builder"
        people={people}
        parentLinks={parentLinks}
        partnerships={partnerships}
      />
    );

    const siblingTransform = parseTranslate(screen.getByText("Child Bottom").closest("g")?.getAttribute("transform") || null);
    const partnerTransform = parseTranslate(screen.getByText("Child Top Partner").closest("g")?.getAttribute("transform") || null);

    expect(siblingTransform).not.toBeNull();
    expect(partnerTransform).not.toBeNull();
    expect(partnerTransform?.x).toBe(siblingTransform?.x);
    expect(partnerTransform?.y).not.toBe(siblingTransform?.y);
    expect(Math.abs((partnerTransform?.y || 0) - (siblingTransform?.y || 0))).toBeGreaterThanOrEqual(132);
  });

  it("renders shared children from the midpoint of the pair instead of a single parent link", () => {
    const tree: DisplayTreeNode = {
      type: "person",
      id: "root",
      name: "Root",
      gender: "male",
      birthDate: "1990-01-01",
      deathDate: null,
      children: [
        {
          type: "person",
          id: "child",
          name: "Child",
          gender: "female",
          birthDate: "2010-01-01",
          deathDate: null,
          children: []
        }
      ]
    };
    const people: PersonRecord[] = [
      {
        id: "root",
        tree_id: "tree-1",
        full_name: "Root",
        gender: "male",
        birth_date: "1990-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "child",
        tree_id: "tree-1",
        full_name: "Child",
        gender: "female",
        birth_date: "2010-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "partner",
        tree_id: "tree-1",
        full_name: "Partner",
        gender: "female",
        birth_date: "1991-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    const parentLinks: ParentLinkRecord[] = [
      {
        id: "link-1",
        tree_id: "tree-1",
        parent_person_id: "root",
        child_person_id: "child",
        relation_type: "biological",
        created_at: new Date().toISOString()
      },
      {
        id: "link-2",
        tree_id: "tree-1",
        parent_person_id: "partner",
        child_person_id: "child",
        relation_type: "biological",
        created_at: new Date().toISOString()
      }
    ];
    const partnerships: PartnershipRecord[] = [
      {
        id: "partnership-1",
        tree_id: "tree-1",
        person_a_id: "root",
        person_b_id: "partner",
        status: "partner",
        start_date: null,
        end_date: null,
        created_at: new Date().toISOString()
      }
    ];

    const { container } = render(
      <FamilyTreeCanvas
        tree={tree}
        selectedPersonId="root"
        onSelectPerson={vi.fn()}
        displayMode="builder"
        people={people}
        parentLinks={parentLinks}
        partnerships={partnerships}
      />
    );

    expect(container.querySelectorAll(".tree-partner-link")).toHaveLength(1);
    expect(container.querySelectorAll(".tree-shared-child-link")).toHaveLength(1);
    expect(container.querySelectorAll(".tree-desc-link")).toHaveLength(0);
    expect(screen.getAllByText("Partner")).toHaveLength(1);
  });

  it("renders parents for an overlay partner without duplicating the partner card", () => {
    const tree: DisplayTreeNode = {
      type: "person",
      id: "root",
      name: "Root",
      gender: "male",
      birthDate: "1990-01-01",
      deathDate: null,
      children: [
        {
          type: "person",
          id: "child",
          name: "Child",
          gender: "female",
          birthDate: "2010-01-01",
          deathDate: null,
          children: []
        }
      ]
    };
    const people: PersonRecord[] = [
      {
        id: "root",
        tree_id: "tree-1",
        full_name: "Root",
        gender: "male",
        birth_date: "1990-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "child",
        tree_id: "tree-1",
        full_name: "Child",
        gender: "female",
        birth_date: "2010-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "partner",
        tree_id: "tree-1",
        full_name: "Partner",
        gender: "male",
        birth_date: "2010-02-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "partner-parent",
        tree_id: "tree-1",
        full_name: "Partner Parent",
        gender: "female",
        birth_date: "1980-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    const parentLinks: ParentLinkRecord[] = [
      {
        id: "link-1",
        tree_id: "tree-1",
        parent_person_id: "root",
        child_person_id: "child",
        relation_type: "biological",
        created_at: new Date().toISOString()
      },
      {
        id: "link-2",
        tree_id: "tree-1",
        parent_person_id: "partner-parent",
        child_person_id: "partner",
        relation_type: "biological",
        created_at: new Date().toISOString()
      }
    ];
    const partnerships: PartnershipRecord[] = [
      {
        id: "partnership-1",
        tree_id: "tree-1",
        person_a_id: "child",
        person_b_id: "partner",
        status: "partner",
        start_date: null,
        end_date: null,
        created_at: new Date().toISOString()
      }
    ];

    render(
      <FamilyTreeCanvas
        tree={tree}
        selectedPersonId="partner"
        onSelectPerson={vi.fn()}
        displayMode="builder"
        people={people}
        parentLinks={parentLinks}
        partnerships={partnerships}
      />
    );

    expect(screen.getAllByText("Partner")).toHaveLength(1);
    expect(screen.getByText("Partner Parent")).toBeInTheDocument();
  });

  it("renders a spouse for an overlay parent", () => {
    const tree: DisplayTreeNode = {
      type: "person",
      id: "root",
      name: "Root",
      gender: "male",
      birthDate: "1990-01-01",
      deathDate: null,
      children: []
    };
    const people: PersonRecord[] = [
      {
        id: "root",
        tree_id: "tree-1",
        full_name: "Root",
        gender: "male",
        birth_date: "1990-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "overlay-parent",
        tree_id: "tree-1",
        full_name: "Overlay Parent",
        gender: "female",
        birth_date: "1970-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "overlay-parent-spouse",
        tree_id: "tree-1",
        full_name: "Overlay Parent Spouse",
        gender: "male",
        birth_date: "1968-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    const parentLinks: ParentLinkRecord[] = [
      {
        id: "link-1",
        tree_id: "tree-1",
        parent_person_id: "overlay-parent",
        child_person_id: "root",
        relation_type: "biological",
        created_at: new Date().toISOString()
      }
    ];
    const partnerships: PartnershipRecord[] = [
      {
        id: "partnership-1",
        tree_id: "tree-1",
        person_a_id: "overlay-parent",
        person_b_id: "overlay-parent-spouse",
        status: "partner",
        start_date: null,
        end_date: null,
        created_at: new Date().toISOString()
      }
    ];

    render(
      <FamilyTreeCanvas
        tree={tree}
        selectedPersonId="overlay-parent-spouse"
        onSelectPerson={vi.fn()}
        displayMode="builder"
        people={people}
        parentLinks={parentLinks}
        partnerships={partnerships}
      />
    );

    expect(screen.getByText("Overlay Parent")).toBeInTheDocument();
    expect(screen.getByText("Overlay Parent Spouse")).toBeInTheDocument();
  });

  it("renders parents for a partner of an overlay parent", () => {
    const tree: DisplayTreeNode = {
      type: "person",
      id: "root",
      name: "Root",
      gender: "male",
      birthDate: "1990-01-01",
      deathDate: null,
      children: []
    };
    const people: PersonRecord[] = [
      {
        id: "root",
        tree_id: "tree-1",
        full_name: "Root",
        gender: "male",
        birth_date: "1990-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "overlay-parent",
        tree_id: "tree-1",
        full_name: "Overlay Parent",
        gender: "female",
        birth_date: "1970-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "overlay-parent-partner",
        tree_id: "tree-1",
        full_name: "Overlay Parent Partner",
        gender: "male",
        birth_date: "1969-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "overlay-parent-partner-parent",
        tree_id: "tree-1",
        full_name: "Overlay Parent Partner Parent",
        gender: "female",
        birth_date: "1945-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    const parentLinks: ParentLinkRecord[] = [
      {
        id: "link-1",
        tree_id: "tree-1",
        parent_person_id: "overlay-parent",
        child_person_id: "root",
        relation_type: "biological",
        created_at: new Date().toISOString()
      },
      {
        id: "link-2",
        tree_id: "tree-1",
        parent_person_id: "overlay-parent-partner-parent",
        child_person_id: "overlay-parent-partner",
        relation_type: "biological",
        created_at: new Date().toISOString()
      }
    ];
    const partnerships: PartnershipRecord[] = [
      {
        id: "partnership-1",
        tree_id: "tree-1",
        person_a_id: "overlay-parent",
        person_b_id: "overlay-parent-partner",
        status: "partner",
        start_date: null,
        end_date: null,
        created_at: new Date().toISOString()
      }
    ];

    render(
      <FamilyTreeCanvas
        tree={tree}
        selectedPersonId="overlay-parent-partner"
        onSelectPerson={vi.fn()}
        displayMode="builder"
        people={people}
        parentLinks={parentLinks}
        partnerships={partnerships}
      />
    );

    expect(screen.getByText("Overlay Parent")).toBeInTheDocument();
    expect(screen.getAllByText("Overlay Parent Partner").length).toBeGreaterThan(1);
    expect(screen.getByText("Parent")).toBeInTheDocument();
  });

  it("keeps builder controls available for a selected overlay partner branch", async () => {
    const tree: DisplayTreeNode = {
      type: "person",
      id: "root",
      name: "Root",
      gender: "male",
      birthDate: "1990-01-01",
      deathDate: null,
      children: []
    };
    const people: PersonRecord[] = [
      {
        id: "root",
        tree_id: "tree-1",
        full_name: "Root",
        gender: "male",
        birth_date: "1990-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "overlay-parent",
        tree_id: "tree-1",
        full_name: "Overlay Parent",
        gender: "female",
        birth_date: "1970-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "overlay-parent-partner",
        tree_id: "tree-1",
        full_name: "Overlay Parent Partner",
        gender: "male",
        birth_date: "1969-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: "overlay-parent-partner-parent",
        tree_id: "tree-1",
        full_name: "Parent",
        gender: "female",
        birth_date: "1945-01-01",
        death_date: null,
        birth_place: null,
        death_place: null,
        bio: null,
        is_living: true,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    const parentLinks: ParentLinkRecord[] = [
      {
        id: "link-1",
        tree_id: "tree-1",
        parent_person_id: "overlay-parent",
        child_person_id: "root",
        relation_type: "biological",
        created_at: new Date().toISOString()
      },
      {
        id: "link-2",
        tree_id: "tree-1",
        parent_person_id: "overlay-parent-partner-parent",
        child_person_id: "overlay-parent-partner",
        relation_type: "biological",
        created_at: new Date().toISOString()
      }
    ];
    const partnerships: PartnershipRecord[] = [
      {
        id: "partnership-1",
        tree_id: "tree-1",
        person_a_id: "overlay-parent",
        person_b_id: "overlay-parent-partner",
        status: "partner",
        start_date: null,
        end_date: null,
        created_at: new Date().toISOString()
      }
    ];

    render(
      <FamilyTreeCanvas
        tree={tree}
        selectedPersonId="overlay-parent-partner"
        onSelectPerson={vi.fn()}
        interactive
        onNodeAction={vi.fn()}
        displayMode="builder"
        people={people}
        parentLinks={parentLinks}
        partnerships={partnerships}
      />
    );

    expect(await screen.findByRole("button", { name: "Открыть меню добавления связи" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Удалить выбранного человека" })).toBeInTheDocument();
  });
});
