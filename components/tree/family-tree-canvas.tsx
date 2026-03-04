"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

import type { DisplayTreeNode } from "@/lib/types";

const CARD_WIDTH = 248;
const CARD_HEIGHT = 102;
const CARD_RADIUS = 18;
const ACTION_BUTTON_RADIUS = 16;
const ACTION_MENU_WIDTH = 164;
const ACTION_MENU_HEIGHT = 148;

function extractYear(value?: string | null) {
  return value ? value.slice(0, 4) : null;
}

function getMonogram(node: DisplayTreeNode) {
  if (node.type === "couple") {
    return "&";
  }

  return (node.name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

function wrapName(name?: string) {
  const normalized = (name || "Неизвестный человек").trim();
  const words = normalized.split(/\s+/);
  const lines: string[] = [];

  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current) {
      lines.push(word);
      continue;
    }

    if (`${current} ${word}`.length <= 22) {
      lines[lines.length - 1] = `${current} ${word}`;
      continue;
    }

    if (lines.length === 1) {
      lines.push(word);
      continue;
    }

    lines[1] = `${lines[1].slice(0, 18)}...`;
    return lines;
  }

  return lines.slice(0, 2);
}

function getNodeLines(node: DisplayTreeNode) {
  if (node.type === "couple" && node.spouseName) {
    return [wrapName(node.name).join(" "), wrapName(node.spouseName).join(" ")];
  }

  return wrapName(node.name);
}

function getNodeSubtitle(node: DisplayTreeNode) {
  if (node.type === "couple") {
    return node.spouseName ? "Семейная пара" : "Партнерство";
  }

  if (node.gender === "female") {
    return "Женщина";
  }

  if (node.gender === "male") {
    return "Мужчина";
  }

  if (node.gender === "other") {
    return "Другое";
  }

  return "Человек";
}

function getNodeMeta(node: DisplayTreeNode) {
  const primaryYears = [extractYear(node.birthDate), extractYear(node.deathDate)].filter(Boolean).join(" - ");
  const spouseYears = [extractYear(node.spouseBirthDate), extractYear(node.spouseDeathDate)].filter(Boolean).join(" - ");

  if (node.type === "couple") {
    if (primaryYears && spouseYears) {
      return `${primaryYears} / ${spouseYears}`;
    }

    return primaryYears || spouseYears || "Даты не указаны";
  }

  return primaryYears || "Даты не указаны";
}

export type FamilyTreeCanvasAction = "edit" | "add-parent" | "add-child" | "add-partner" | "delete";

interface TreeCanvasSelectionCandidate {
  type: DisplayTreeNode["type"];
  id?: string;
  primaryId?: string | null;
  spouseId?: string | null;
}

function matchesSelection(candidate: TreeCanvasSelectionCandidate, selectedPersonId: string | null) {
  if (!selectedPersonId) {
    return false;
  }

  if (candidate.type === "couple") {
    return candidate.primaryId === selectedPersonId || candidate.spouseId === selectedPersonId;
  }

  return candidate.id === selectedPersonId;
}

function getFocusedPersonId(candidate: TreeCanvasSelectionCandidate, selectedPersonId: string | null) {
  if (candidate.type === "couple") {
    if (candidate.spouseId && candidate.spouseId === selectedPersonId) {
      return candidate.spouseId;
    }

    return candidate.primaryId || null;
  }

  return candidate.id || null;
}

export function selectPreferredCanvasItem<T>(
  items: T[],
  selectedPersonId: string | null,
  getCandidate: (item: T) => TreeCanvasSelectionCandidate
) {
  if (!selectedPersonId) {
    return null;
  }

  const matches = items.filter((item) => matchesSelection(getCandidate(item), selectedPersonId));
  if (!matches.length) {
    return null;
  }

  return matches.find((item) => getCandidate(item).type === "person") || matches[0] || null;
}

interface FamilyTreeCanvasProps {
  tree: DisplayTreeNode | null;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  interactive?: boolean;
  onNodeAction?: (personId: string, action: FamilyTreeCanvasAction) => void;
  onEmptyAction?: () => void;
}

interface CanvasActionHandleOptions {
  toneClass: string;
  x: number;
  y: number;
  ariaLabel: string;
  icon: "plus" | "trash";
  onClick: () => void;
}

function renderCanvasActionHandle(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  options: CanvasActionHandleOptions
) {
  const handle = group
    .append("g")
    .attr("class", `tree-node-action-handle ${options.toneClass}`)
    .attr("transform", `translate(${options.x},${options.y})`)
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr("aria-label", options.ariaLabel)
    .style("cursor", "pointer");

  handle
    .append("circle")
    .attr("r", ACTION_BUTTON_RADIUS)
    .attr("class", "tree-node-action-bubble");

  if (options.icon === "plus") {
    handle
      .append("text")
      .attr("class", "tree-node-action-symbol")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .text("+");
  } else {
    handle
      .append("path")
      .attr("class", "tree-node-action-trash")
      .attr("d", "M -5 -4 H 5 M -2 -6 H 2 M -4 -3 L -3 6 H 3 L 4 -3 M -1 -1 V 4 M 1 -1 V 4");
  }

  const clickHandler = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onClick();
  };

  handle.on("click", clickHandler);
  handle.on("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      clickHandler(event);
    }
  });
}

export function FamilyTreeCanvas({
  tree,
  selectedPersonId,
  onSelectPerson,
  interactive = false,
  onNodeAction,
  onEmptyAction
}: FamilyTreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSelectPersonRef = useRef(onSelectPerson);
  const onNodeActionRef = useRef(onNodeAction);
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const hierarchy = useMemo(() => {
    if (!tree) {
      return null;
    }

    return d3.hierarchy(tree, (node) => node.children || []);
  }, [tree]);

  useEffect(() => {
    setCreateMenuOpen(false);
  }, [selectedPersonId]);

  useEffect(() => {
    onSelectPersonRef.current = onSelectPerson;
  }, [onSelectPerson]);

  useEffect(() => {
    onNodeActionRef.current = onNodeAction;
  }, [onNodeAction]);

  useEffect(() => {
    if (!interactive || !createMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        setCreateMenuOpen(false);
        return;
      }

      if (!target.closest(".tree-node-action-menu")) {
        setCreateMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreateMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [createMenuOpen, interactive]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hierarchy) {
      return;
    }

    container.innerHTML = "";
    const width = container.clientWidth || 960;
    const height = container.clientHeight || 620;

    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("height", "100%");
    const graph = svg.append("g");
    const graphContent = graph.append("g");
    const overlayLayer = graph.append("g");
    const defs = svg.append("defs");

    const shadow = defs
      .append("filter")
      .attr("id", "tree-node-shadow")
      .attr("x", "-20%")
      .attr("y", "-20%")
      .attr("width", "140%")
      .attr("height", "140%");

    shadow.append("feDropShadow").attr("dx", 0).attr("dy", 10).attr("stdDeviation", 12).attr("flood-color", "#181b22").attr("flood-opacity", 0.08);

    const layout = d3.tree<DisplayTreeNode>().nodeSize([148, 310]).separation((a, b) => (a.parent === b.parent ? 1.08 : 1.35));
    const root = layout(hierarchy);
    const descendants = root.descendants();
    const selectedNode = selectPreferredCanvasItem(descendants, selectedPersonId, (datum) => datum.data);

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 2.5])
      .on("zoom", (event) => {
        zoomTransformRef.current = event.transform;
        graph.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    graphContent
      .selectAll("path")
      .data(root.links())
      .enter()
      .append("path")
      .attr("class", "tree-link")
      .attr(
        "d",
        d3
          .linkHorizontal<d3.HierarchyPointLink<DisplayTreeNode>, d3.HierarchyPointNode<DisplayTreeNode>>()
          .x((point) => point.y)
          .y((point) => point.x)
      );

    const nodes = graphContent
      .selectAll("g.node")
      .data(descendants)
      .enter()
      .append("g")
      .attr("class", (datum) => (datum === selectedNode ? "node tree-node-selected" : "node"))
      .attr("transform", (datum) => `translate(${datum.y},${datum.x})`)
      .style("cursor", "pointer")
      .on("click", (_event, datum) => {
        const id = getFocusedPersonId(datum.data, selectedPersonId);
        if (id) {
          onSelectPersonRef.current(id);
        }
      });

    nodes
      .filter((datum) => datum === selectedNode)
      .insert("rect", ":first-child")
      .attr("x", -CARD_WIDTH / 2 - 5)
      .attr("y", -CARD_HEIGHT / 2 - 5)
      .attr("rx", CARD_RADIUS + 5)
      .attr("width", CARD_WIDTH + 10)
      .attr("height", CARD_HEIGHT + 10)
      .attr("class", "tree-card-selection-halo");

    nodes
      .append("rect")
      .attr("x", -CARD_WIDTH / 2)
      .attr("y", -CARD_HEIGHT / 2)
      .attr("rx", CARD_RADIUS)
      .attr("width", CARD_WIDTH)
      .attr("height", CARD_HEIGHT)
      .attr("filter", "url(#tree-node-shadow)")
      .attr("class", (datum) => {
        const tone = datum.data.type === "couple" ? "tree-card tree-card-couple" : "tree-card tree-card-person";
        return datum === selectedNode ? `${tone} tree-card-selected` : tone;
      });

    nodes
      .append("circle")
      .attr("cx", -CARD_WIDTH / 2 + 30)
      .attr("cy", -6)
      .attr("r", 20)
      .attr("class", (datum) => (datum.data.type === "couple" ? "tree-node-badge tree-node-badge-couple" : "tree-node-badge"));

    nodes
      .append("text")
      .attr("class", "tree-node-initials")
      .attr("text-anchor", "middle")
      .attr("x", -CARD_WIDTH / 2 + 30)
      .attr("y", 0)
      .text((datum) => getMonogram(datum.data));

    nodes.each(function renderNodeText(datum) {
      const group = d3.select(this);
      const labelX = -CARD_WIDTH / 2 + 60;
      const lines = getNodeLines(datum.data);
      lines.forEach((line, index) => {
        group
          .append("text")
          .attr("class", index === 0 ? "tree-node-label" : "tree-node-label tree-node-label-secondary")
          .attr("text-anchor", "start")
          .attr("x", labelX)
          .attr("y", -16 + index * 16)
          .text(line);
      });

      group
        .append("text")
        .attr("class", "tree-node-sub")
        .attr("text-anchor", "start")
        .attr("x", labelX)
        .attr("y", lines.length > 1 ? 18 : 10)
        .text(getNodeSubtitle(datum.data));

      group
        .append("text")
        .attr("class", "tree-node-meta")
        .attr("text-anchor", "start")
        .attr("x", labelX)
        .attr("y", lines.length > 1 ? 34 : 26)
        .text(getNodeMeta(datum.data));
    });

    if (interactive && selectedNode) {
      const selectedNodeId = getFocusedPersonId(selectedNode.data, selectedPersonId);
      if (selectedNodeId) {
        const isCoupleNode = selectedNode.data.type === "couple";
        const controlsGroup = overlayLayer
          .append("g")
          .attr("class", "tree-node-controls")
          .attr("transform", `translate(${selectedNode.y},${selectedNode.x})`);

        renderCanvasActionHandle(controlsGroup, {
          toneClass: createMenuOpen ? "tree-node-action-plus tree-node-action-plus-open" : "tree-node-action-plus",
          x: CARD_WIDTH / 2 - 22,
          y: -CARD_HEIGHT / 2 + 20,
          ariaLabel: "Открыть меню добавления связи",
          icon: "plus",
          onClick: () => {
            setCreateMenuOpen((value) => !value);
          }
        });

        if (!isCoupleNode) {
          renderCanvasActionHandle(controlsGroup, {
            toneClass: "tree-node-action-delete",
            x: CARD_WIDTH / 2 - 22,
            y: CARD_HEIGHT / 2 - 20,
            ariaLabel: "Удалить выбранного человека",
            icon: "trash",
            onClick: () => {
              onNodeActionRef.current?.(selectedNodeId, "delete");
            }
          });
        }

        if (createMenuOpen) {
          const menuShell = overlayLayer
            .append("foreignObject")
            .attr("x", selectedNode.y + CARD_WIDTH / 2 - ACTION_MENU_WIDTH + 18)
            .attr("y", selectedNode.x - CARD_HEIGHT / 2 + 42)
            .attr("width", ACTION_MENU_WIDTH)
            .attr("height", ACTION_MENU_HEIGHT)
            .style("overflow", "visible");

          const menuRoot = menuShell
            .append("xhtml:div")
            .attr("class", "tree-node-action-menu")
            .html(`
              <button type="button" data-action="add-child">Добавить ребенка</button>
              <button type="button" data-action="add-parent">Добавить родителя</button>
              ${isCoupleNode ? "" : '<button type="button" data-action="add-partner">Добавить партнера</button>'}
            `);

          const menuElement = menuRoot.node() as HTMLDivElement | null;
          if (menuElement) {
            menuElement.addEventListener("pointerdown", (event) => event.stopPropagation());
            menuElement.addEventListener("click", (event) => event.stopPropagation());

            const menuButtons = menuElement.querySelectorAll<HTMLButtonElement>("[data-action]");
            menuButtons.forEach((menuButton) => {
              menuButton.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const action = menuButton.dataset.action as FamilyTreeCanvasAction;
                onNodeActionRef.current?.(selectedNodeId, action);
                setCreateMenuOpen(false);
              });
            });
          }
        }
      }
    }

    const bounds = graphContent.node()?.getBBox();

    if (zoomTransformRef.current) {
      svg.call(zoom.transform, zoomTransformRef.current);
    } else if (bounds && bounds.width > 0 && bounds.height > 0) {
      const scale = Math.min((width - 140) / bounds.width, (height - 120) / bounds.height, 1);
      const x = (width - bounds.width * scale) / 2 - bounds.x * scale;
      const y = (height - bounds.height * scale) / 2 - bounds.y * scale;
      svg.call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    }
  }, [createMenuOpen, hierarchy, interactive, selectedPersonId]);

  if (!tree) {
    return (
      <div className="empty-state tree-canvas-empty">
        <p>Добавьте первого человека. Он станет корнем автоматически, а потом корень можно сменить прямо в конструкторе.</p>
        {interactive && onEmptyAction ? (
          <button type="button" className="primary-button tree-canvas-empty-action" onClick={onEmptyAction}>
            Добавить первый блок
          </button>
        ) : null}
      </div>
    );
  }

  return <div ref={containerRef} className="tree-canvas" />;
}
