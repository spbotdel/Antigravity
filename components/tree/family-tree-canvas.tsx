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
const BUILDER_FOCUS_X_RATIO = 0.46;
const BUILDER_FOCUS_Y_RATIO = 0.34;
const VIEWER_FIT_X_RATIO = 0.38;
const VIEWER_FIT_Y_RATIO = 0.24;
const BADGE_RADIUS = 20;
const BADGE_CX = -CARD_WIDTH / 2 + 30;
const BADGE_CY = -6;
const PARTNER_VERTICAL_GAP = 108;
const PARTNER_MIN_SEPARATION = 108;
const PARTNERSHIP_LABEL_Y_OFFSET = -1;

const GENDER_FALLBACK_AVATARS: Record<"male" | "female", string> = {
  male: "/avatars/avatar-male.svg",
  female: "/avatars/avatar-female.svg"
};
const EMPTY_PERSON_PHOTO_URLS: Record<string, string> = {};

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

function getAvatarPatternId(personId: string) {
  return `tree-avatar-${personId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function getPersonBadgeImage(
  personId: string | undefined,
  gender: string | null | undefined,
  personPhotoUrls: Record<string, string> | undefined
) {
  if (personId && personPhotoUrls?.[personId]) {
    return personPhotoUrls[personId];
  }

  if (gender === "female") {
    return GENDER_FALLBACK_AVATARS.female;
  }

  if (gender === "male") {
    return GENDER_FALLBACK_AVATARS.male;
  }

  return null;
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
  onPartnershipDateChange?: (partnershipId: string, startDate: string | null) => Promise<void> | void;
  onEmptyAction?: () => void;
  createPreview?: FamilyTreeCanvasCreatePreview | null;
  displayMode?: "viewer" | "builder";
  people?: PersonRecord[];
  parentLinks?: ParentLinkRecord[];
  partnerships?: PartnershipRecord[];
  personPhotoUrls?: Record<string, string>;
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
  return { x: anchorNode.y, y: anchorNode.x + partnerDirection * PARTNER_VERTICAL_GAP };
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
  const preferredDirection = options.index % 2 === 0 ? 1 : -1;
  const maxLevel = Math.max(baseLevel + 4, Math.ceil(options.occupiedYs.length / 2) + 2);
  const candidates: Array<{ direction: number; level: number; targetY: number; score: number }> = [];

  for (let level = baseLevel; level <= maxLevel; level += 1) {
    const baseOffset = PARTNER_VERTICAL_GAP * level;
    for (const direction of [preferredDirection, -preferredDirection]) {
      const targetY = options.anchorY + direction * baseOffset;
      const nearestDistance = options.occupiedYs.length
        ? options.occupiedYs.reduce((minDistance, value) => Math.min(minDistance, Math.abs(value - targetY)), Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      const overlapPenalty = nearestDistance < PARTNER_MIN_SEPARATION ? 500 + (PARTNER_MIN_SEPARATION - nearestDistance) * 20 : 0;
      const boundsPenalty = targetY < options.treeTop - PARTNER_VERTICAL_GAP || targetY > options.treeBottom + PARTNER_VERTICAL_GAP ? 22 : 0;
      const distancePenalty = (level - baseLevel) * 36;
      const directionalBias = direction === preferredDirection ? 0 : 8;

      candidates.push({
        direction,
        level,
        targetY,
        score: overlapPenalty + boundsPenalty + distancePenalty + directionalBias
      });
    }
  }

  candidates.sort((left, right) => left.score - right.score || left.level - right.level || left.direction - right.direction);
  return candidates[0]?.targetY ?? options.anchorY + getPartnerDirection(options.index) * PARTNER_VERTICAL_GAP;
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

function normalizeIsoDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function formatCanvasDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function getFocusedTransform(
  width: number,
  height: number,
  point: { x: number; y: number },
  scale: number,
  xRatio = 0.5,
  yRatio = 0.5
) {
  return d3.zoomIdentity.translate(width * xRatio - point.x * scale, height * yRatio - point.y * scale).scale(scale);
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

interface BuilderPartnershipLabel {
  key: string;
  partnershipId: string;
  text: string;
  inputDate: string;
  width: number;
  x: number;
  y: number;
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
    return sign * PARTNER_VERTICAL_GAP * level;
  });
}

function getColumnOccupiedYs(nodes: PositionedCanvasNode[], x: number) {
  return nodes.filter((node) => node.x === x).map((node) => node.y);
}

function getLocalColumnOccupiedYs(nodes: PositionedCanvasNode[], anchor: { x: number; y: number }) {
  const localRange = PARTNER_VERTICAL_GAP * 2 + CARD_HEIGHT;
  const occupied = getColumnOccupiedYs(nodes, anchor.x).filter((value) => Math.abs(value - anchor.y) <= localRange);
  if (!occupied.some((value) => value === anchor.y)) {
    occupied.push(anchor.y);
  }

  return occupied;
}

function getPartnerPlacementY(nodes: PositionedCanvasNode[], anchor: { x: number; y: number }, index: number) {
  const occupiedYs = getLocalColumnOccupiedYs(nodes, anchor);
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
    return { links: [] as BuilderCanvasLink[], nodes: [] as PositionedCanvasNode[], partnershipLabels: [] as BuilderPartnershipLabel[] };
  }

  const peopleById = new Map(people.map((person) => [person.id, person] as const));
  const childrenByParent = new Map<string, string[]>();
  const parentIdsByChild = new Map<string, string[]>();
  const partnershipsByPerson = new Map<string, PartnershipRecord[]>();
  const partnershipDateLabelById = new Map<string, { text: string; inputDate: string }>();

  parentLinks.forEach((link) => {
    const nextChildren = childrenByParent.get(link.parent_person_id) || [];
    nextChildren.push(link.child_person_id);
    childrenByParent.set(link.parent_person_id, nextChildren);

    const nextParents = parentIdsByChild.get(link.child_person_id) || [];
    nextParents.push(link.parent_person_id);
    parentIdsByChild.set(link.child_person_id, nextParents);
  });

  function resolvePartnershipDateLabel(partnership: PartnershipRecord) {
    const partnershipDate = normalizeIsoDate(partnership.start_date);
    if (partnershipDate) {
      return { text: formatCanvasDate(partnershipDate), inputDate: partnershipDate };
    }

    const firstSideChildren = new Set(childrenByParent.get(partnership.person_a_id) || []);
    const secondSideChildren = new Set(childrenByParent.get(partnership.person_b_id) || []);
    const firstSharedChildDate = [...firstSideChildren]
      .filter((childId) => secondSideChildren.has(childId))
      .map((childId) => normalizeIsoDate(peopleById.get(childId)?.birth_date || null))
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right))[0];

    if (firstSharedChildDate) {
      return { text: formatCanvasDate(firstSharedChildDate), inputDate: firstSharedChildDate };
    }

    return { text: "укажите дату", inputDate: "" };
  }

  partnerships.forEach((partnership) => {
    const personALinks = partnershipsByPerson.get(partnership.person_a_id) || [];
    personALinks.push(partnership);
    partnershipsByPerson.set(partnership.person_a_id, personALinks);

    const personBLinks = partnershipsByPerson.get(partnership.person_b_id) || [];
    personBLinks.push(partnership);
    partnershipsByPerson.set(partnership.person_b_id, personBLinks);

    partnershipDateLabelById.set(partnership.id, resolvePartnershipDateLabel(partnership));
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
  const partnershipLabels: BuilderPartnershipLabel[] = [];
  const seenPartnershipLabels = new Set<string>();
  const positionsById = new Map<string, { x: number; y: number }>();
  const subtree = measure(tree.rootId);

  function addPartnershipLabel(anchor: { x: number; y: number }, partner: { x: number; y: number }, partnershipId: string) {
    if (!partnershipId || seenPartnershipLabels.has(partnershipId)) {
      return;
    }

    const dateLabel = partnershipDateLabelById.get(partnershipId);
    if (!dateLabel) {
      return;
    }

    seenPartnershipLabels.add(partnershipId);
    const labelWidth = Math.max(108, dateLabel.text.length * 7 + 36);
    partnershipLabels.push({
      key: `partnership-label:${partnershipId}`,
      partnershipId,
      text: dateLabel.text,
      inputDate: dateLabel.inputDate,
      width: labelWidth,
      x: anchor.x,
      y: (anchor.y + partner.y) / 2 + PARTNERSHIP_LABEL_Y_OFFSET
    });
  }

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
      addPartnershipLabel(anchor, { x: partnerNode.x, y: partnerNode.y }, spec.partnershipId);

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
        const occupiedYs = getLocalColumnOccupiedYs(nodes, anchor);
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
        addPartnershipLabel(anchor, { x: partnerNode.x, y: partnerNode.y }, partnerPartnership.id);
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

  return { links, nodes, partnershipLabels };
}

export function FamilyTreeCanvas({
  tree,
  selectedPersonId,
  onSelectPerson,
  interactive = false,
  onNodeAction,
  onPartnershipDateChange,
  onEmptyAction,
  createPreview = null,
  displayMode = "viewer",
  people = [],
  parentLinks = [],
  partnerships = [],
  personPhotoUrls = EMPTY_PERSON_PHOTO_URLS
}: FamilyTreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSelectPersonRef = useRef(onSelectPerson);
  const onNodeActionRef = useRef(onNodeAction);
  const onPartnershipDateChangeRef = useRef(onPartnershipDateChange);
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  const lastSelectedPersonIdRef = useRef<string | null>(selectedPersonId);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [editingPartnershipId, setEditingPartnershipId] = useState<string | null>(null);

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
    setEditingPartnershipId(null);
  }, [selectedPersonId, displayMode]);

  useEffect(() => {
    onSelectPersonRef.current = onSelectPerson;
  }, [onSelectPerson]);

  useEffect(() => {
    onNodeActionRef.current = onNodeAction;
  }, [onNodeAction]);

  useEffect(() => {
    onPartnershipDateChangeRef.current = onPartnershipDateChange;
  }, [onPartnershipDateChange]);

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
    const avatarPatternByPersonId = new Map<string, string>();

    const shadow = defs
      .append("filter")
      .attr("id", "tree-node-shadow")
      .attr("x", "-20%")
      .attr("y", "-20%")
      .attr("width", "140%")
      .attr("height", "140%");

    shadow.append("feDropShadow").attr("dx", 0).attr("dy", 10).attr("stdDeviation", 12).attr("flood-color", "#181b22").attr("flood-opacity", 0.08);

    function registerAvatarPattern(personId: string, source: string) {
      if (avatarPatternByPersonId.has(personId)) {
        return avatarPatternByPersonId.get(personId)!;
      }

      const patternId = getAvatarPatternId(personId);
      defs
        .append("pattern")
        .attr("id", patternId)
        .attr("patternUnits", "objectBoundingBox")
        .attr("patternContentUnits", "objectBoundingBox")
        .attr("width", 1)
        .attr("height", 1)
        .append("image")
        .attr("href", source)
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 1)
        .attr("height", 1)
        .attr("preserveAspectRatio", "xMidYMid slice")
        .attr("opacity", 0.96);

      avatarPatternByPersonId.set(personId, patternId);
      return patternId;
    }

    if (displayMode === "builder") {
      const layout = buildBuilderCanvasLayout(tree, people, parentLinks, partnerships, selectedPersonId);
      const selectedCanvasNode = selectedPersonId ? layout.nodes.find((node) => node.id === selectedPersonId) || null : null;
      const selectedChanged = lastSelectedPersonIdRef.current !== selectedPersonId;
      layout.nodes.forEach((node) => {
        if (node.type !== "person" || !node.id) {
          return;
        }

        const badgeImage = getPersonBadgeImage(node.id, node.gender, personPhotoUrls);
        if (!badgeImage) {
          return;
        }

        registerAvatarPattern(node.id, badgeImage);
      });

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

      const partnershipLabels = overlayLayer
        .selectAll("g.builder-partnership-label")
        .data(layout.partnershipLabels)
        .enter()
        .append("g")
        .attr("class", "builder-partnership-label")
        .attr("transform", (datum) => `translate(${datum.x},${datum.y})`);

      const canEditPartnershipDates = interactive && displayMode === "builder" && Boolean(onPartnershipDateChangeRef.current);

      partnershipLabels
        .append("rect")
        .attr("x", (datum) => -datum.width / 2)
        .attr("y", -10)
        .attr("rx", 10)
        .attr("width", (datum) => datum.width)
        .attr("height", 20)
        .attr("class", "tree-partnership-chip");

      const partnershipText = partnershipLabels
        .append("text")
        .attr("class", "tree-partnership-chip-text")
        .attr("text-anchor", "middle")
        .attr("x", 0)
        .attr("y", 1);

      partnershipText
        .append("tspan")
        .attr("class", "tree-partnership-chip-heart")
        .text("❤ ");

      partnershipText
        .append("tspan")
        .text((datum) => datum.text);

      if (canEditPartnershipDates) {
        partnershipLabels
          .attr("class", (datum) =>
            datum.partnershipId === editingPartnershipId
              ? "builder-partnership-label builder-partnership-label-editing"
              : "builder-partnership-label builder-partnership-label-interactive"
          )
          .attr("role", "button")
          .attr("tabindex", 0)
          .style("cursor", "pointer")
          .attr("aria-label", "Редактировать дату пары")
          .on("click", (event, datum) => {
            event.preventDefault();
            event.stopPropagation();
            setCreateMenuOpen(false);
            setEditingPartnershipId(datum.partnershipId);
          })
          .on("keydown", (event: KeyboardEvent, datum) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            setCreateMenuOpen(false);
            setEditingPartnershipId(datum.partnershipId);
          });
      }

      if (canEditPartnershipDates && editingPartnershipId) {
        const activeLabel = layout.partnershipLabels.find((label) => label.partnershipId === editingPartnershipId) || null;
        if (activeLabel) {
          const editorWidth = Math.max(210, activeLabel.width + 92);
          const editorShell = overlayLayer
            .append("foreignObject")
            .attr("x", activeLabel.x - editorWidth / 2)
            .attr("y", activeLabel.y - 16)
            .attr("width", editorWidth)
            .attr("height", 34)
            .style("overflow", "visible");

          const editorRoot = editorShell
            .append("xhtml:div")
            .attr("class", "tree-partnership-editor")
            .html(
              `<form class="tree-partnership-editor-form">` +
                `<span class="tree-partnership-editor-heart">❤</span>` +
                `<input class="tree-partnership-editor-input" type="date" aria-label="Дата пары" value="${activeLabel.inputDate}" />` +
                `<button class="tree-partnership-editor-save" type="submit" aria-label="Сохранить дату пары">OK</button>` +
                `<button class="tree-partnership-editor-cancel" type="button" aria-label="Отменить редактирование даты пары">✕</button>` +
              `</form>`
            );

          const editorElement = editorRoot.node() as HTMLDivElement | null;
          if (editorElement) {
            const form = editorElement.querySelector<HTMLFormElement>("form");
            const input = editorElement.querySelector<HTMLInputElement>("input");
            const saveButton = editorElement.querySelector<HTMLButtonElement>(".tree-partnership-editor-save");
            const cancelButton = editorElement.querySelector<HTMLButtonElement>(".tree-partnership-editor-cancel");

            const closeEditor = () => {
              setEditingPartnershipId((current) => (current === activeLabel.partnershipId ? null : current));
            };

            const blockEvent = (event: Event) => {
              event.stopPropagation();
            };

            editorElement.addEventListener("pointerdown", blockEvent);
            editorElement.addEventListener("click", blockEvent);
            editorElement.addEventListener("wheel", blockEvent, { passive: true });

            cancelButton?.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              closeEditor();
            });

            input?.addEventListener("keydown", (event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeEditor();
              }
            });

            if (form && input) {
              form.addEventListener("submit", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                if (!onPartnershipDateChangeRef.current) {
                  closeEditor();
                  return;
                }

                input.disabled = true;
                if (saveButton) {
                  saveButton.disabled = true;
                }
                if (cancelButton) {
                  cancelButton.disabled = true;
                }

                try {
                  await onPartnershipDateChangeRef.current(activeLabel.partnershipId, input.value || null);
                  closeEditor();
                } catch {
                  input.disabled = false;
                  if (saveButton) {
                    saveButton.disabled = false;
                  }
                  if (cancelButton) {
                    cancelButton.disabled = false;
                  }
                }
              });
            }

            window.setTimeout(() => {
              input?.focus();
            }, 0);
          }
        } else {
          setEditingPartnershipId(null);
        }
      }

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
        .attr("cx", BADGE_CX)
        .attr("cy", BADGE_CY)
        .attr("r", BADGE_RADIUS)
        .attr("class", "tree-node-badge")
        .attr("fill", (datum) => {
          if (!datum.id) {
            return null;
          }

          const patternId = avatarPatternByPersonId.get(datum.id);
          return patternId ? `url(#${patternId})` : null;
        });

      nodes
        .filter((datum) => !datum.id || !avatarPatternByPersonId.has(datum.id))
        .append("text")
        .attr("class", "tree-node-initials")
        .attr("text-anchor", "middle")
        .attr("x", BADGE_CX)
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
            svg.call(
              zoom.transform,
              getFocusedTransform(width, height, selectedCanvasNode, nextScale, BUILDER_FOCUS_X_RATIO, BUILDER_FOCUS_Y_RATIO)
            );
          } else {
            svg.call(zoom.transform, zoomTransformRef.current);
          }
        } else {
          const scale = bounds && bounds.width > 0 && bounds.height > 0
            ? Math.max(Math.min((width - 140) / bounds.width, (height - 120) / bounds.height, 1), BUILDER_SELECTED_MIN_SCALE)
            : BUILDER_SELECTED_MIN_SCALE;
          svg.call(
            zoom.transform,
            getFocusedTransform(width, height, selectedCanvasNode, scale, BUILDER_FOCUS_X_RATIO, BUILDER_FOCUS_Y_RATIO)
          );
        }
      } else if (zoomTransformRef.current) {
        svg.call(zoom.transform, zoomTransformRef.current);
      } else if (bounds && bounds.width > 0 && bounds.height > 0) {
        const scale = Math.min((width - 140) / bounds.width, (height - 120) / bounds.height, 1);
        const x = width * VIEWER_FIT_X_RATIO - bounds.x * scale;
        const y = height * VIEWER_FIT_Y_RATIO - bounds.y * scale;
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
    descendants.forEach((datum) => {
      if (datum.data.type !== "person" || !datum.data.id) {
        return;
      }

      const badgeImage = getPersonBadgeImage(datum.data.id, datum.data.gender, personPhotoUrls);
      if (!badgeImage) {
        return;
      }

      registerAvatarPattern(datum.data.id, badgeImage);
    });
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
      .attr("cx", BADGE_CX)
      .attr("cy", BADGE_CY)
      .attr("r", BADGE_RADIUS)
      .attr("class", (datum) => (datum.data.type === "couple" ? "tree-node-badge tree-node-badge-couple" : "tree-node-badge"))
      .attr("fill", (datum) => {
        if (datum.data.type !== "person" || !datum.data.id) {
          return null;
        }

        const patternId = avatarPatternByPersonId.get(datum.data.id);
        return patternId ? `url(#${patternId})` : null;
      });

    nodes
      .filter((datum) => datum.data.type === "couple" || !datum.data.id || !avatarPatternByPersonId.has(datum.data.id))
      .append("text")
      .attr("class", "tree-node-initials")
      .attr("text-anchor", "middle")
      .attr("x", BADGE_CX)
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
      const x = width * VIEWER_FIT_X_RATIO - bounds.x * scale;
      const y = height * VIEWER_FIT_Y_RATIO - bounds.y * scale;
      svg.call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    }
  }, [createMenuOpen, displayMode, editingPartnershipId, hierarchy, interactive, parentLinks, partnerships, people, personPhotoUrls, selectedPersonId]);

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
