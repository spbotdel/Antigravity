"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

import type { DisplayTreeNode, ParentLinkRecord, PartnershipRecord, PersonRecord } from "@/lib/types";

const CARD_WIDTH = 248;
const CARD_HEIGHT = 102;
const CARD_RADIUS = 18;
const ACTION_BUTTON_RADIUS = 16;
const ACTION_MENU_WIDTH = 164;
const ACTION_MENU_HEIGHT = 148;
const BUILDER_SELECTED_MIN_SCALE = 0.55;
const BUILDER_VIEWPORT_MARGIN_X = 96;
const BUILDER_VIEWPORT_MARGIN_Y = 84;

function extractYear(value?: string | null) {
  return value ? value.slice(0, 4) : null;
}

function getMonogramFromName(name?: string) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

function getMonogram(node: Pick<DisplayTreeNode, "type" | "name">) {
  if (node.type === "couple") {
    return "&";
  }

  return getMonogramFromName(node.name);
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

function getNodeLines(node: Pick<DisplayTreeNode, "type" | "name" | "spouseName">) {
  if (node.type === "couple" && node.spouseName) {
    return [wrapName(node.name).join(" "), wrapName(node.spouseName).join(" ")];
  }

  return wrapName(node.name);
}

function getNodeSubtitle(node: { type: "person" | "couple"; spouseName?: string | null; gender?: string | null }) {
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

function getNodeMeta(node: {
  type: "person" | "couple";
  birthDate?: string | null;
  deathDate?: string | null;
  spouseBirthDate?: string | null;
  spouseDeathDate?: string | null;
}) {
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

export interface FamilyTreeCanvasCreatePreview {
  relationType: "parent" | "child" | "partner";
  anchorPersonId: string;
  title: string;
}

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
  createPreview?: FamilyTreeCanvasCreatePreview | null;
  displayMode?: "viewer" | "builder";
  people?: PersonRecord[];
  parentLinks?: ParentLinkRecord[];
  partnerships?: PartnershipRecord[];
}

interface PositionedCanvasNode {
  type: "person" | "couple";
  id?: string;
  primaryId?: string | null;
  spouseId?: string | null;
  partnershipId?: string | null;
  name?: string;
  spouseName?: string | null;
  gender?: string | null;
  spouseGender?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  spouseBirthDate?: string | null;
  spouseDeathDate?: string | null;
  x: number;
  y: number;
  anchorId?: string | null;
  relationType?: "parent" | "partner";
  sharedChildIds?: string[];
  isOverlay?: boolean;
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

function getPreviewSubtitle(relationType: FamilyTreeCanvasCreatePreview["relationType"]) {
  return "Человек";
}

function getPreviewCenter(
  anchorNode: d3.HierarchyPointNode<DisplayTreeNode>,
  relationType: FamilyTreeCanvasCreatePreview["relationType"],
  treeTop: number,
  treeBottom: number
) {
  if (relationType === "child") {
    return { x: anchorNode.y + 310, y: anchorNode.x };
  }

  if (relationType === "parent") {
    return { x: anchorNode.y - 310, y: anchorNode.x };
  }

  const partnerDirection = anchorNode.x > (treeTop + treeBottom) / 2 ? -1 : 1;
  return { x: anchorNode.y, y: anchorNode.x + partnerDirection * 156 };
}

function buildPreviewLinkPath(
  anchorNode: d3.HierarchyPointNode<DisplayTreeNode>,
  previewCenter: { x: number; y: number },
  relationType: FamilyTreeCanvasCreatePreview["relationType"]
) {
  if (relationType === "child") {
    const startX = anchorNode.y + CARD_WIDTH / 2;
    const startY = anchorNode.x;
    const endX = previewCenter.x - CARD_WIDTH / 2;
    const endY = previewCenter.y;
    const controlX = (startX + endX) / 2;
    return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
  }

  if (relationType === "parent") {
    const startX = anchorNode.y - CARD_WIDTH / 2;
    const startY = anchorNode.x;
    const endX = previewCenter.x + CARD_WIDTH / 2;
    const endY = previewCenter.y;
    const controlX = (startX + endX) / 2;
    return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
  }

  const direction = previewCenter.y > anchorNode.x ? 1 : -1;
  const startX = anchorNode.y;
  const startY = anchorNode.x + direction * (CARD_HEIGHT / 2);
  const endX = previewCenter.x;
  const endY = previewCenter.y - direction * (CARD_HEIGHT / 2);
  const controlY = (startY + endY) / 2;
  return `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`;
}

function buildSideLinkPath(
  anchor: { x: number; y: number },
  overlayNode: Pick<PositionedCanvasNode, "x" | "y" | "relationType">
) {
  if (overlayNode.relationType === "parent") {
    const fromX = anchor.x - CARD_WIDTH / 2;
    const fromY = anchor.y;
    const toX = overlayNode.x + CARD_WIDTH / 2;
    const toY = overlayNode.y;
    const controlX = (fromX + toX) / 2;
    return `M ${fromX} ${fromY} C ${controlX} ${fromY}, ${controlX} ${toY}, ${toX} ${toY}`;
  }

  const direction = overlayNode.y > anchor.y ? 1 : -1;
  const fromX = anchor.x;
  const fromY = anchor.y + direction * (CARD_HEIGHT / 2);
  const toX = overlayNode.x;
  const toY = overlayNode.y - direction * (CARD_HEIGHT / 2);
  const controlY = (fromY + toY) / 2;
  return `M ${fromX} ${fromY} C ${fromX} ${controlY}, ${toX} ${controlY}, ${toX} ${toY}`;
}

function getPartnerDirection(index: number) {
  const level = Math.floor(index / 2) + 1;
  const sign = index % 2 === 0 ? 1 : -1;
  return sign * level;
}

function getParentVerticalOffset(index: number, total: number) {
  if (total <= 1) {
    return 0;
  }

  return (index - (total - 1) / 2) * 156;
}

function getParentSlot(index: number, total: number) {
  const column = Math.floor(index / 2) + 1;
  const itemsBefore = (column - 1) * 2;
  const itemsInColumn = Math.min(2, Math.max(0, total - itemsBefore));

  if (itemsInColumn <= 1) {
    return { column, yOffset: 0 };
  }

  return {
    column,
    yOffset: index % 2 === 0 ? -84 : 84
  };
}

function getPreferredPartnerOffset(options: {
  anchorY: number;
  index: number;
  occupiedYs: number[];
  treeTop: number;
  treeBottom: number;
}) {
  const baseLevel = Math.floor(options.index / 2) + 1;
  const maxLevel = Math.max(baseLevel + 3, Math.ceil(options.occupiedYs.length / 2) + 1);
  const candidates: Array<{ direction: number; level: number; targetY: number; score: number }> = [];

  for (let level = baseLevel; level <= maxLevel; level += 1) {
    const baseOffset = 156 * level;
    for (const direction of [1, -1]) {
      const targetY = options.anchorY + direction * baseOffset;
      const crowdingScore = options.occupiedYs.reduce((score, value) => {
        const distance = Math.abs(value - targetY);
        return score + Math.max(0, 220 - distance);
      }, 0);
      const boundsPenalty = targetY < options.treeTop - 220 || targetY > options.treeBottom + 220 ? 24 : 0;
      const distancePenalty = (level - baseLevel) * 18;
      const directionalBias = direction === 1 ? -4 : 0;

      candidates.push({
        direction,
        level,
        targetY,
        score: crowdingScore + boundsPenalty + distancePenalty + directionalBias
      });
    }
  }

  candidates.sort((left, right) => left.score - right.score || left.level - right.level || left.direction - right.direction);
  return candidates[0]?.targetY ?? options.anchorY + getPartnerDirection(options.index) * 156;
}

function buildPartnerConnectorPath(anchor: { x: number; y: number }, partner: { x: number; y: number }) {
  const direction = partner.y > anchor.y ? 1 : -1;
  const x = anchor.x + CARD_WIDTH / 2 - 28;
  const fromY = anchor.y + direction * (CARD_HEIGHT / 2 - 6);
  const toY = partner.y - direction * (CARD_HEIGHT / 2 - 6);
  const midY = (fromY + toY) / 2;

  return `M ${x} ${fromY} C ${x} ${midY}, ${x} ${midY}, ${x} ${toY}`;
}

function buildSharedChildLinkPath(
  anchor: { x: number; y: number },
  partner: { x: number; y: number },
  child: { x: number; y: number }
) {
  const fromX = anchor.x + CARD_WIDTH / 2 - 8;
  const fromY = (anchor.y + partner.y) / 2;
  const toX = child.x - CARD_WIDTH / 2;
  const toY = child.y;
  const controlX = (fromX + toX) / 2;

  return `M ${fromX} ${fromY} C ${controlX} ${fromY}, ${controlX} ${toY}, ${toX} ${toY}`;
}

function getCenteredTransform(
  width: number,
  height: number,
  point: { x: number; y: number },
  scale: number
) {
  return d3.zoomIdentity.translate(width / 2 - point.x * scale, height / 2 - point.y * scale).scale(scale);
}

function isPointComfortablyVisible(
  transform: d3.ZoomTransform,
  point: { x: number; y: number },
  width: number,
  height: number
) {
  const screenX = transform.applyX(point.x);
  const screenY = transform.applyY(point.y);

  return (
    screenX >= BUILDER_VIEWPORT_MARGIN_X &&
    screenX <= width - BUILDER_VIEWPORT_MARGIN_X &&
    screenY >= BUILDER_VIEWPORT_MARGIN_Y &&
    screenY <= height - BUILDER_VIEWPORT_MARGIN_Y
  );
}

interface BuilderCanvasLink {
  className: string;
  d: string;
  key: string;
}

interface BuilderCanvasMeasure {
  bottomPad: number;
  childMeasures: BuilderCanvasMeasure[];
  height: number;
  partnerReach: number;
  partnerSpecs: Array<{
    partnerId: string;
    partnershipId: string;
    sharedChildIds: string[];
  }>;
  personId: string;
  topPad: number;
}

function buildHorizontalChildLinkPath(source: { x: number; y: number }, target: { x: number; y: number }) {
  const fromX = source.x + CARD_WIDTH / 2;
  const fromY = source.y;
  const toX = target.x - CARD_WIDTH / 2;
  const toY = target.y;
  const controlX = (fromX + toX) / 2;

  return `M ${fromX} ${fromY} C ${controlX} ${fromY}, ${controlX} ${toY}, ${toX} ${toY}`;
}

function getPartnerOffsets(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const level = Math.floor(index / 2) + 1;
    const sign = index % 2 === 0 ? 1 : -1;
    return sign * 156 * level;
  });
}

function getColumnOccupiedYs(nodes: PositionedCanvasNode[], x: number) {
  return nodes.filter((node) => node.x === x).map((node) => node.y);
}

function getPartnerPlacementY(nodes: PositionedCanvasNode[], anchor: { x: number; y: number }, index: number) {
  const occupiedYs = getColumnOccupiedYs(nodes, anchor.x);
  const columnTop = occupiedYs.length ? Math.min(anchor.y, ...occupiedYs) : anchor.y;
  const columnBottom = occupiedYs.length ? Math.max(anchor.y, ...occupiedYs) : anchor.y;

  return getPreferredPartnerOffset({
    anchorY: anchor.y,
    index,
    occupiedYs,
    treeTop: columnTop,
    treeBottom: columnBottom
  });
}

function collectBuilderTree(root: DisplayTreeNode) {
  const visibleIds = new Set<string>();
  const childrenById = new Map<string, string[]>();

  function walk(node: DisplayTreeNode) {
    if (node.type !== "person" || !node.id) {
      return;
    }

    visibleIds.add(node.id);
    const childIds =
      node.children
        ?.filter((child): child is DisplayTreeNode & { id: string; type: "person" } => child.type === "person" && Boolean(child.id))
        .map((child) => child.id) || [];
    childrenById.set(node.id, childIds);
    node.children?.forEach((child) => walk(child));
  }

  walk(root);

  return {
    childrenById,
    rootId: root.type === "person" ? root.id || null : null,
    visibleIds
  };
}

function buildBuilderCanvasLayout(
  root: DisplayTreeNode,
  people: PersonRecord[],
  parentLinks: ParentLinkRecord[],
  partnerships: PartnershipRecord[],
  selectedPersonId: string | null
) {
  const tree = collectBuilderTree(root);
  if (!tree.rootId) {
    return { links: [] as BuilderCanvasLink[], nodes: [] as PositionedCanvasNode[] };
  }

  const peopleById = new Map(people.map((person) => [person.id, person] as const));
  const childrenByParent = new Map<string, string[]>();
  const parentIdsByChild = new Map<string, string[]>();
  const partnershipsByPerson = new Map<string, PartnershipRecord[]>();

  parentLinks.forEach((link) => {
    const nextChildren = childrenByParent.get(link.parent_person_id) || [];
    nextChildren.push(link.child_person_id);
    childrenByParent.set(link.parent_person_id, nextChildren);

    const nextParents = parentIdsByChild.get(link.child_person_id) || [];
    nextParents.push(link.parent_person_id);
    parentIdsByChild.set(link.child_person_id, nextParents);
  });

  partnerships.forEach((partnership) => {
    const personALinks = partnershipsByPerson.get(partnership.person_a_id) || [];
    personALinks.push(partnership);
    partnershipsByPerson.set(partnership.person_a_id, personALinks);

    const personBLinks = partnershipsByPerson.get(partnership.person_b_id) || [];
    personBLinks.push(partnership);
    partnershipsByPerson.set(partnership.person_b_id, personBLinks);
  });

  function arePartners(personAId: string, personBId: string) {
    return (partnershipsByPerson.get(personAId) || []).some(
      (partnership) =>
        (partnership.person_a_id === personAId && partnership.person_b_id === personBId) ||
        (partnership.person_b_id === personAId && partnership.person_a_id === personBId)
    );
  }

  function getPartnerSpecs(personId: string) {
    const visibleChildren = tree.childrenById.get(personId) || [];
    const primaryChildren = new Set(childrenByParent.get(personId) || []);
    const seenPartnerIds = new Set<string>();

    return (partnershipsByPerson.get(personId) || [])
      .map((partnership) => {
        const partnerId = partnership.person_a_id === personId ? partnership.person_b_id : partnership.person_a_id;
        if (!partnerId || tree.visibleIds.has(partnerId) || seenPartnerIds.has(partnerId)) {
          return null;
        }

        seenPartnerIds.add(partnerId);
        const partnerChildren = new Set(childrenByParent.get(partnerId) || []);
        return {
          partnerId,
          partnershipId: partnership.id,
          sharedChildIds: visibleChildren.filter((childId) => primaryChildren.has(childId) && partnerChildren.has(childId))
        };
      })
      .filter(Boolean) as BuilderCanvasMeasure["partnerSpecs"];
  }

  function getInvisibleParentIdsForPerson(personId: string) {
    const visibleParents = (parentIdsByChild.get(personId) || []).filter((parentId) => tree.visibleIds.has(parentId));

    return (parentIdsByChild.get(personId) || []).filter(
      (parentId) => !tree.visibleIds.has(parentId) && !visibleParents.some((visibleParentId) => arePartners(visibleParentId, parentId))
    );
  }

  function measure(personId: string): BuilderCanvasMeasure {
    const childMeasures = (tree.childrenById.get(personId) || []).map((childId) => measure(childId));
    const partnerSpecs = getPartnerSpecs(personId);
    const partnerOffsets = getPartnerOffsets(partnerSpecs.length);
    const partnerReach = Math.max(0, ...partnerOffsets.map((offset) => Math.abs(offset)));
    const topPad = partnerReach;
    const bottomPad = partnerReach;
    const localHeight = topPad + bottomPad + CARD_HEIGHT;
    const childrenHeight = childMeasures.reduce((sum, child, index) => sum + child.height + (index ? 56 : 0), 0);

    return {
      bottomPad,
      childMeasures,
      height: Math.max(localHeight, childrenHeight || localHeight),
      partnerReach,
      partnerSpecs,
      personId,
      topPad
    };
  }

  const nodes: PositionedCanvasNode[] = [];
  const links: BuilderCanvasLink[] = [];
  const positionsById = new Map<string, { x: number; y: number }>();
  const subtree = measure(tree.rootId);

  function addPartnersForPerson(personId: string, anchor: { x: number; y: number }) {
    const partnerSpecs = (partnershipsByPerson.get(personId) || [])
      .map((partnership) => {
        const partnerId = partnership.person_a_id === personId ? partnership.person_b_id : partnership.person_a_id;
        if (!partnerId || tree.visibleIds.has(partnerId) || positionsById.has(partnerId)) {
          return null;
        }

        return {
          partnerId,
          partnershipId: partnership.id
        };
      })
      .filter(Boolean) as Array<{ partnerId: string; partnershipId: string }>;

    partnerSpecs.forEach((spec, index) => {
      const partner = peopleById.get(spec.partnerId);
      if (!partner) {
        return;
      }

      const partnerY = getPartnerPlacementY(nodes, anchor, index);

      const partnerNode: PositionedCanvasNode = {
        type: "person",
        id: partner.id,
        name: partner.full_name,
        gender: partner.gender,
        birthDate: partner.birth_date,
        deathDate: partner.death_date,
        x: anchor.x,
        y: partnerY,
        anchorId: personId,
        relationType: "partner",
        partnershipId: spec.partnershipId,
        sharedChildIds: [],
        isOverlay: true
      };

      nodes.push(partnerNode);
      positionsById.set(partner.id, { x: partnerNode.x, y: partnerNode.y });
      links.push({
        className: "tree-link tree-side-link tree-partner-link",
        d: buildPartnerConnectorPath(anchor, partnerNode),
        key: `partner:${personId}:${partner.id}`
      });

      addInvisibleParentsForPerson(partner.id, { x: partnerNode.x, y: partnerNode.y });
    });
  }

  function addInvisibleParentsForPerson(personId: string, anchor: { x: number; y: number }) {
    const invisibleParents = getInvisibleParentIdsForPerson(personId);

    invisibleParents.forEach((parentId, index) => {
      if (positionsById.has(parentId)) {
        return;
      }

      const parent = peopleById.get(parentId);
      if (!parent) {
        return;
      }

      const slot = getParentSlot(index, invisibleParents.length);
      const parentNode: PositionedCanvasNode = {
        type: "person",
        id: parent.id,
        name: parent.full_name,
        gender: parent.gender,
        birthDate: parent.birth_date,
        deathDate: parent.death_date,
        x: anchor.x - 310 * slot.column,
        y: anchor.y + slot.yOffset,
        anchorId: personId,
        relationType: "parent",
        isOverlay: true
      };
      nodes.push(parentNode);
      positionsById.set(parent.id, { x: parentNode.x, y: parentNode.y });
      links.push({
        className: "tree-link tree-side-link tree-parent-link",
        d: buildSideLinkPath(anchor, parentNode),
        key: `parent:${parent.id}:${personId}`
      });

      addPartnersForPerson(parent.id, { x: parentNode.x, y: parentNode.y });
    });
  }

  function ensureSelectedNodeVisible(personId: string) {
    if (positionsById.has(personId)) {
      return;
    }

    const person = peopleById.get(personId);
    if (!person) {
      return;
    }

    const partnerPartnership = (partnershipsByPerson.get(personId) || []).find((partnership) => {
      const partnerId = partnership.person_a_id === personId ? partnership.person_b_id : partnership.person_a_id;
      return Boolean(partnerId && positionsById.has(partnerId));
    });

    if (partnerPartnership) {
      const partnerId = partnerPartnership.person_a_id === personId ? partnerPartnership.person_b_id : partnerPartnership.person_a_id;
      const anchor = partnerId ? positionsById.get(partnerId) : null;
      if (anchor) {
        const existingPartnerNodes = nodes.filter((node) => node.anchorId === partnerId && node.relationType === "partner");
        const occupiedYs = nodes
          .filter((node) => node.x === anchor.x)
          .map((node) => node.y);
        const y = getPreferredPartnerOffset({
          anchorY: anchor.y,
          index: existingPartnerNodes.length,
          occupiedYs,
          treeTop: Math.min(...occupiedYs, anchor.y),
          treeBottom: Math.max(...occupiedYs, anchor.y)
        });
        const partnerNode: PositionedCanvasNode = {
          type: "person",
          id: person.id,
          name: person.full_name,
          gender: person.gender,
          birthDate: person.birth_date,
          deathDate: person.death_date,
          x: anchor.x,
          y,
          anchorId: partnerId,
          relationType: "partner",
          partnershipId: partnerPartnership.id,
          sharedChildIds: [],
          isOverlay: true
        };

        nodes.push(partnerNode);
        positionsById.set(person.id, { x: partnerNode.x, y: partnerNode.y });
        links.push({
          className: "tree-link tree-side-link tree-partner-link",
          d: buildPartnerConnectorPath(anchor, partnerNode),
          key: `selected-partner:${partnerId}:${person.id}`
        });
        addInvisibleParentsForPerson(person.id, { x: partnerNode.x, y: partnerNode.y });
        return;
      }
    }

    const anchoredChildId = (childrenByParent.get(personId) || []).find((childId) => positionsById.has(childId));
    if (anchoredChildId) {
      const anchor = positionsById.get(anchoredChildId);
      if (anchor) {
        const invisibleParents = getInvisibleParentIdsForPerson(anchoredChildId);
        const siblingParentNodes = nodes.filter((node) => node.anchorId === anchoredChildId && node.relationType === "parent");
        const parentIndex = invisibleParents.indexOf(personId);
        const slot = getParentSlot(parentIndex >= 0 ? parentIndex : siblingParentNodes.length, Math.max(invisibleParents.length, siblingParentNodes.length + 1));
        const parentNode: PositionedCanvasNode = {
          type: "person",
          id: person.id,
          name: person.full_name,
          gender: person.gender,
          birthDate: person.birth_date,
          deathDate: person.death_date,
          x: anchor.x - 310 * slot.column,
          y: anchor.y + slot.yOffset,
          anchorId: anchoredChildId,
          relationType: "parent",
          isOverlay: true
        };

        nodes.push(parentNode);
        positionsById.set(person.id, { x: parentNode.x, y: parentNode.y });
        links.push({
          className: "tree-link tree-side-link tree-parent-link",
          d: buildSideLinkPath(anchor, parentNode),
          key: `selected-parent:${person.id}:${anchoredChildId}`
        });
        addPartnersForPerson(person.id, { x: parentNode.x, y: parentNode.y });
        return;
      }
    }

    const anchoredParentId = (parentIdsByChild.get(personId) || []).find((parentId) => positionsById.has(parentId));
    if (anchoredParentId) {
      const anchor = positionsById.get(anchoredParentId);
      if (anchor) {
        const positionedChildren = nodes.filter((node) => node.x === anchor.x + 360).map((node) => node.y);
        let y = anchor.y;
        while (positionedChildren.some((value) => Math.abs(value - y) < 132)) {
          y += 156;
        }

        const childNode: PositionedCanvasNode = {
          type: "person",
          id: person.id,
          name: person.full_name,
          gender: person.gender,
          birthDate: person.birth_date,
          deathDate: person.death_date,
          x: anchor.x + 360,
          y
        };

        nodes.push(childNode);
        positionsById.set(person.id, { x: childNode.x, y: childNode.y });
        links.push({
          className: "tree-link tree-desc-link",
          d: buildHorizontalChildLinkPath(anchor, childNode),
          key: `selected-child:${anchoredParentId}:${person.id}`
        });
        addPartnersForPerson(person.id, { x: childNode.x, y: childNode.y });
        addInvisibleParentsForPerson(person.id, { x: childNode.x, y: childNode.y });
        return;
      }
    }

    const fallbackNode: PositionedCanvasNode = {
      type: "person",
      id: person.id,
      name: person.full_name,
      gender: person.gender,
      birthDate: person.birth_date,
      deathDate: person.death_date,
      x: -360,
      y: 0
    };

    nodes.push(fallbackNode);
    positionsById.set(person.id, { x: fallbackNode.x, y: fallbackNode.y });
    addPartnersForPerson(person.id, { x: fallbackNode.x, y: fallbackNode.y });
    addInvisibleParentsForPerson(person.id, { x: fallbackNode.x, y: fallbackNode.y });
  }

  function place(subtreeMeasure: BuilderCanvasMeasure, depth: number, top: number) {
    const x = depth * 360;
    const childrenHeight = subtreeMeasure.childMeasures.reduce((sum, child, index) => sum + child.height + (index ? 56 : 0), 0);
    let childTop = top + (subtreeMeasure.height - childrenHeight) / 2;

    subtreeMeasure.childMeasures.forEach((child) => {
      place(child, depth + 1, childTop);
      childTop += child.height + 56;
    });

    const firstChild = subtreeMeasure.childMeasures[0] ? positionsById.get(subtreeMeasure.childMeasures[0].personId) : null;
    const lastChild = subtreeMeasure.childMeasures[subtreeMeasure.childMeasures.length - 1]
      ? positionsById.get(subtreeMeasure.childMeasures[subtreeMeasure.childMeasures.length - 1].personId)
      : null;
    const minCenter = top + subtreeMeasure.topPad + CARD_HEIGHT / 2;
    const maxCenter = top + subtreeMeasure.height - subtreeMeasure.bottomPad - CARD_HEIGHT / 2;
    const naturalCenter = firstChild && lastChild ? (firstChild.y + lastChild.y) / 2 : top + subtreeMeasure.height / 2;
    const y = Math.max(minCenter, Math.min(maxCenter, naturalCenter));
    const person = peopleById.get(subtreeMeasure.personId);
    if (!person) {
      return;
    }

    const personNode: PositionedCanvasNode = {
      type: "person",
      id: person.id,
      name: person.full_name,
      gender: person.gender,
      birthDate: person.birth_date,
      deathDate: person.death_date,
      x,
      y
    };
    nodes.push(personNode);
    positionsById.set(person.id, { x, y });
  }

  place(subtree, 0, 0);

  function decorateVisiblePeople(subtreeMeasure: BuilderCanvasMeasure) {
    const anchor = positionsById.get(subtreeMeasure.personId);
    if (anchor) {
      addPartnersForPerson(subtreeMeasure.personId, anchor);
      addInvisibleParentsForPerson(subtreeMeasure.personId, anchor);
    }

    subtreeMeasure.childMeasures.forEach((childMeasure) => {
      decorateVisiblePeople(childMeasure);
    });
  }

  function linkVisiblePeople(subtreeMeasure: BuilderCanvasMeasure) {
    const anchor = positionsById.get(subtreeMeasure.personId);
    if (!anchor) {
      return;
    }

    subtreeMeasure.childMeasures.forEach((childMeasure) => {
      const childPosition = positionsById.get(childMeasure.personId);
      if (!childPosition) {
        return;
      }

      const sharedPartner = subtreeMeasure.partnerSpecs.find((spec) => spec.sharedChildIds.includes(childMeasure.personId));
      if (sharedPartner) {
        const partnerPosition = positionsById.get(sharedPartner.partnerId);
        if (partnerPosition) {
          links.push({
            className: "tree-link tree-shared-child-link",
            d: buildSharedChildLinkPath(anchor, partnerPosition, childPosition),
            key: `shared-child:${subtreeMeasure.personId}:${sharedPartner.partnerId}:${childMeasure.personId}`
          });
        } else {
          links.push({
            className: "tree-link tree-desc-link",
            d: buildHorizontalChildLinkPath(anchor, childPosition),
            key: `child:${subtreeMeasure.personId}:${childMeasure.personId}`
          });
        }
      } else {
        links.push({
          className: "tree-link tree-desc-link",
          d: buildHorizontalChildLinkPath(anchor, childPosition),
          key: `child:${subtreeMeasure.personId}:${childMeasure.personId}`
        });
      }

      linkVisiblePeople(childMeasure);
    });
  }

  decorateVisiblePeople(subtree);
  linkVisiblePeople(subtree);

  if (selectedPersonId) {
    ensureSelectedNodeVisible(selectedPersonId);
  }

  return { links, nodes };
}

export function FamilyTreeCanvas({
  tree,
  selectedPersonId,
  onSelectPerson,
  interactive = false,
  onNodeAction,
  onEmptyAction,
  createPreview = null,
  displayMode = "viewer",
  people = [],
  parentLinks = [],
  partnerships = []
}: FamilyTreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSelectPersonRef = useRef(onSelectPerson);
  const onNodeActionRef = useRef(onNodeAction);
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  const lastSelectedPersonIdRef = useRef<string | null>(selectedPersonId);
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
    if (!container || !tree) {
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

    if (displayMode === "builder") {
      const layout = buildBuilderCanvasLayout(tree, people, parentLinks, partnerships, selectedPersonId);
      const selectedCanvasNode = selectedPersonId ? layout.nodes.find((node) => node.id === selectedPersonId) || null : null;
      const selectedChanged = lastSelectedPersonIdRef.current !== selectedPersonId;

      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.25, 2.5])
        .on("zoom", (event) => {
          zoomTransformRef.current = event.transform;
          graph.attr("transform", event.transform.toString());
        });

      svg.call(zoom);

      graphContent
        .selectAll("path.builder-link")
        .data(layout.links)
        .enter()
        .append("path")
        .attr("class", (datum) => datum.className)
        .attr("d", (datum) => datum.d);

      const nodes = graphContent
        .selectAll("g.builder-node")
        .data(layout.nodes)
        .enter()
        .append("g")
        .attr("class", (datum) => (datum.id === selectedPersonId ? "builder-node tree-node-selected" : "builder-node"))
        .attr("transform", (datum) => `translate(${datum.x},${datum.y})`)
        .style("cursor", "pointer")
        .on("click", (_event, datum) => {
          if (datum.id) {
            onSelectPersonRef.current(datum.id);
          }
        });

      nodes
        .filter((datum) => datum.id === selectedPersonId)
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
        .attr("class", (datum) => (datum.id === selectedPersonId ? "tree-card tree-card-person tree-card-selected" : "tree-card tree-card-person"));

      nodes
        .append("circle")
        .attr("cx", -CARD_WIDTH / 2 + 30)
        .attr("cy", -6)
        .attr("r", 20)
        .attr("class", "tree-node-badge");

      nodes
        .append("text")
        .attr("class", "tree-node-initials")
        .attr("text-anchor", "middle")
        .attr("x", -CARD_WIDTH / 2 + 30)
        .attr("y", 0)
        .text((datum) => getMonogramFromName(datum.name));

      nodes.each(function renderBuilderNodeText(datum) {
        const group = d3.select(this);
        const labelX = -CARD_WIDTH / 2 + 60;
        const lines = wrapName(datum.name);

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
          .text(getNodeSubtitle(datum));

        group
          .append("text")
          .attr("class", "tree-node-meta")
          .attr("text-anchor", "start")
          .attr("x", labelX)
          .attr("y", lines.length > 1 ? 34 : 26)
          .text(getNodeMeta(datum));
      });

      if (interactive && selectedCanvasNode?.id) {
        const controlsGroup = overlayLayer
          .append("g")
          .attr("class", "tree-node-controls")
          .attr("transform", `translate(${selectedCanvasNode.x},${selectedCanvasNode.y})`);

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

        renderCanvasActionHandle(controlsGroup, {
          toneClass: "tree-node-action-delete",
          x: CARD_WIDTH / 2 - 22,
          y: CARD_HEIGHT / 2 - 20,
          ariaLabel: "Удалить выбранного человека",
          icon: "trash",
          onClick: () => {
            onNodeActionRef.current?.(selectedCanvasNode.id!, "delete");
          }
        });

        if (createMenuOpen) {
          const menuShell = overlayLayer
            .append("foreignObject")
            .attr("x", selectedCanvasNode.x + CARD_WIDTH / 2 - ACTION_MENU_WIDTH + 18)
            .attr("y", selectedCanvasNode.y - CARD_HEIGHT / 2 + 42)
            .attr("width", ACTION_MENU_WIDTH)
            .attr("height", ACTION_MENU_HEIGHT)
            .style("overflow", "visible");

          const menuRoot = menuShell
            .append("xhtml:div")
            .attr("class", "tree-node-action-menu")
            .html(`
              <button type="button" data-action="add-child">Добавить ребенка</button>
              <button type="button" data-action="add-parent">Добавить родителя</button>
              <button type="button" data-action="add-partner">Добавить партнера</button>
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
                onNodeActionRef.current?.(selectedCanvasNode.id!, action);
                setCreateMenuOpen(false);
              });
            });
          }
        }
      }

      const bounds = graph.node()?.getBBox();

      if (selectedCanvasNode) {
        if (zoomTransformRef.current) {
          if (
            selectedChanged &&
            (!isPointComfortablyVisible(zoomTransformRef.current, selectedCanvasNode, width, height) ||
              zoomTransformRef.current.k < BUILDER_SELECTED_MIN_SCALE)
          ) {
            const nextScale = Math.max(zoomTransformRef.current.k, BUILDER_SELECTED_MIN_SCALE);
            svg.call(zoom.transform, getCenteredTransform(width, height, selectedCanvasNode, nextScale));
          } else {
            svg.call(zoom.transform, zoomTransformRef.current);
          }
        } else {
          const scale = bounds && bounds.width > 0 && bounds.height > 0
            ? Math.max(Math.min((width - 140) / bounds.width, (height - 120) / bounds.height, 1), BUILDER_SELECTED_MIN_SCALE)
            : BUILDER_SELECTED_MIN_SCALE;
          svg.call(zoom.transform, getCenteredTransform(width, height, selectedCanvasNode, scale));
        }
      } else if (zoomTransformRef.current) {
        svg.call(zoom.transform, zoomTransformRef.current);
      } else if (bounds && bounds.width > 0 && bounds.height > 0) {
        const scale = Math.min((width - 140) / bounds.width, (height - 120) / bounds.height, 1);
        const x = (width - bounds.width * scale) / 2 - bounds.x * scale;
        const y = (height - bounds.height * scale) / 2 - bounds.y * scale;
        svg.call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
      }

      lastSelectedPersonIdRef.current = selectedPersonId;

      return;
    }

    if (!hierarchy) {
      return;
    }

    const layout = d3.tree<DisplayTreeNode>().nodeSize([148, 310]).separation((a, b) => (a.parent === b.parent ? 1.08 : 1.35));
    const root = layout(hierarchy);
    const descendants = root.descendants();
    const selectedNode = selectPreferredCanvasItem(descendants, selectedPersonId, (datum) => datum.data);
    const previewAnchorNode = createPreview
      ? selectPreferredCanvasItem(descendants, createPreview.anchorPersonId, (datum) => datum.data)
      : null;
    const treeTop = d3.min(descendants, (datum) => datum.x) ?? 0;
    const treeBottom = d3.max(descendants, (datum) => datum.x) ?? 0;
    const descendantIds = new Set(descendants.flatMap((datum) => {
      const ids: string[] = [];
      if (datum.data.id) {
        ids.push(datum.data.id);
      }
      if (datum.data.primaryId) {
        ids.push(datum.data.primaryId);
      }
      if (datum.data.spouseId) {
        ids.push(datum.data.spouseId);
      }
      return ids;
    }));
    const selectedCanvasNode = selectedNode
      ? {
          x: selectedNode.y,
          y: selectedNode.x,
          data: selectedNode.data
        }
      : null;

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 2.5])
      .on("zoom", (event) => {
        zoomTransformRef.current = event.transform;
        graph.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    graphContent
      .selectAll("path.tree-desc-link")
      .data(root.links())
      .enter()
      .append("path")
      .attr("class", "tree-link tree-desc-link")
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

    if (createPreview && previewAnchorNode) {
      const previewCenter = getPreviewCenter(previewAnchorNode, createPreview.relationType, treeTop, treeBottom);
      const previewNode = overlayLayer
        .append("g")
        .attr("class", "tree-preview-node")
        .attr("transform", `translate(${previewCenter.x},${previewCenter.y})`);
      const previewLabelX = -CARD_WIDTH / 2 + 60;
      const previewLines = wrapName(createPreview.title);

      overlayLayer
        .append("path")
        .attr("class", "tree-link tree-preview-link")
        .attr("d", buildPreviewLinkPath(previewAnchorNode, previewCenter, createPreview.relationType));

      previewNode
        .append("rect")
        .attr("x", -CARD_WIDTH / 2)
        .attr("y", -CARD_HEIGHT / 2)
        .attr("rx", CARD_RADIUS)
        .attr("width", CARD_WIDTH)
        .attr("height", CARD_HEIGHT)
        .attr("filter", "url(#tree-node-shadow)")
        .attr("class", "tree-card tree-card-preview");

      previewNode
        .append("circle")
        .attr("cx", -CARD_WIDTH / 2 + 30)
        .attr("cy", -6)
        .attr("r", 20)
        .attr("class", "tree-node-badge tree-node-badge-preview");

      previewNode
        .append("text")
        .attr("class", "tree-node-initials")
        .attr("text-anchor", "middle")
        .attr("x", -CARD_WIDTH / 2 + 30)
        .attr("y", 0)
        .text(getMonogramFromName(createPreview.title));

      previewLines.forEach((line, index) => {
        previewNode
          .append("text")
          .attr("class", index === 0 ? "tree-node-label" : "tree-node-label tree-node-label-secondary")
          .attr("text-anchor", "start")
          .attr("x", previewLabelX)
          .attr("y", -16 + index * 16)
          .text(line);
      });

      previewNode
        .append("text")
        .attr("class", "tree-node-sub")
        .attr("text-anchor", "start")
        .attr("x", previewLabelX)
        .attr("y", previewLines.length > 1 ? 18 : 10)
        .text(getPreviewSubtitle(createPreview.relationType));

      previewNode
        .append("text")
        .attr("class", "tree-node-meta")
        .attr("text-anchor", "start")
        .attr("x", previewLabelX)
        .attr("y", previewLines.length > 1 ? 34 : 26)
        .text("Даты не указаны");
    }

    if (interactive && selectedCanvasNode) {
      const selectedNodeId =
        "primaryId" in selectedCanvasNode.data || "spouseId" in selectedCanvasNode.data
          ? getFocusedPersonId(selectedCanvasNode.data, selectedPersonId)
          : selectedCanvasNode.data.id || null;
      if (selectedNodeId) {
        const isCoupleNode = selectedCanvasNode.data.type === "couple";
        const controlsGroup = overlayLayer
          .append("g")
          .attr("class", "tree-node-controls")
          .attr("transform", `translate(${selectedCanvasNode.x},${selectedCanvasNode.y})`);

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
            .attr("x", selectedCanvasNode.x + CARD_WIDTH / 2 - ACTION_MENU_WIDTH + 18)
            .attr("y", selectedCanvasNode.y - CARD_HEIGHT / 2 + 42)
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

    const bounds = graph.node()?.getBBox();

    if (zoomTransformRef.current) {
      svg.call(zoom.transform, zoomTransformRef.current);
    } else if (bounds && bounds.width > 0 && bounds.height > 0) {
      const scale = Math.min((width - 140) / bounds.width, (height - 120) / bounds.height, 1);
      const x = (width - bounds.width * scale) / 2 - bounds.x * scale;
      const y = (height - bounds.height * scale) / 2 - bounds.y * scale;
      svg.call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    }
  }, [createMenuOpen, displayMode, hierarchy, interactive, parentLinks, partnerships, people, selectedPersonId]);

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
