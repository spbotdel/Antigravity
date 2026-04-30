"use client";

import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FamilyTreeCanvas } from "@/components/tree/family-tree-canvas";
import { PersonMediaGallery } from "@/components/tree/person-media-gallery";
import { TreeOverlay } from "@/components/tree/tree-overlay";
import { buildBuilderDisplayTree, buildMediaOpenRouteUrl, buildPersonPhotoPreviewUrls, collectPersonMedia, countTreeGenerations } from "@/lib/tree/display";
import type { TreeSnapshot } from "@/lib/types";
import { logMediaError } from "@/lib/utils";

interface TreeViewerClientProps {
  snapshot: TreeSnapshot;
  shareToken?: string | null;
}

type ViewerViewportMode = "desktop" | "tablet-landscape" | "tablet-portrait" | "phone";
type ViewerPanelState = "hidden" | "peek" | "collapsed" | "open";
type PhoneSheetGestureAxis = "horizontal" | "vertical";

const PHONE_VIEWER_MAX_WIDTH = 767;
const TABLET_VIEWER_MAX_WIDTH = 1180;
const PHONE_VIEWER_PEEK_HEIGHT = 40;
const PHONE_VIEWER_DRAG_START_THRESHOLD = 10;
const PHONE_VIEWER_SWIPE_THRESHOLD = 30;
const PHONE_VIEWER_SWIPE_VELOCITY_THRESHOLD = 0.55;
const PHONE_VIEWER_SETTLE_DISTANCE_RATIO = 0.52;
const PHONE_VIEWER_SWIPE_MAX_HORIZONTAL = 44;
const PHONE_VIEWER_CANVAS_INSET_TOP = 56;
const PHONE_VIEWER_CANVAS_INSET_BOTTOM = 64;
const PHONE_VIEWER_CANVAS_MARGIN_X = 8;
const PHONE_VIEWER_CANVAS_MARGIN_Y = 12;
const TABLET_VIEWER_CANVAS_MARGIN_X = 22;
const TABLET_VIEWER_CANVAS_MARGIN_Y = 28;
const TABLET_VIEWER_SELECTED_MIN_SCALE = 0.82;

function getViewerViewportMode(width: number, height: number): ViewerViewportMode {
  if (width <= PHONE_VIEWER_MAX_WIDTH) {
    return "phone";
  }

  if (width <= TABLET_VIEWER_MAX_WIDTH) {
    return height > width ? "tablet-portrait" : "tablet-landscape";
  }

  return "desktop";
}

function usesBottomSheetLayout(viewportMode: ViewerViewportMode) {
  return viewportMode === "phone" || viewportMode === "tablet-portrait";
}

function usesSidePanelLayout(viewportMode: ViewerViewportMode) {
  return viewportMode === "desktop" || viewportMode === "tablet-landscape";
}

function normalizeViewerPanelState(currentState: ViewerPanelState, hasSelection: boolean, viewportMode: ViewerViewportMode): ViewerPanelState {
  if (!hasSelection) {
    return usesSidePanelLayout(viewportMode) ? "open" : "hidden";
  }

  if (usesBottomSheetLayout(viewportMode)) {
    return currentState === "open" ? "open" : "peek";
  }

  return currentState === "open" ? "open" : "collapsed";
}

function getPhoneSheetPeekTranslate(height: number | null) {
  if (!height || height <= PHONE_VIEWER_PEEK_HEIGHT) {
    return 0;
  }

  return height - PHONE_VIEWER_PEEK_HEIGHT;
}

interface PhoneSheetGestureState {
  x: number;
  y: number;
  scrollTop: number;
  startTime: number;
  lastTime: number;
  lastY: number;
  velocityY: number;
  startTranslate: number;
  currentTranslate: number;
  peekTranslate: number;
  axis: PhoneSheetGestureAxis | null;
  didDrag: boolean;
}

function isPhoneSheetHandleTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(".viewer-phone-sheet-toggle"));
}

function isPhoneSheetInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  const interactiveTarget = target.closest(
    [
      "a",
      "button",
      "input",
      "textarea",
      "select",
      "summary",
      "[role='button']",
      "[role='link']",
      "[contenteditable='true']",
      "[data-slot='button']",
      "[data-slot='tabs-trigger']",
    ].join(",")
  );

  return Boolean(interactiveTarget && !interactiveTarget.closest(".viewer-phone-sheet-toggle"));
}

function withShareToken(url: string, shareToken?: string | null) {
  if (!shareToken) {
    return url;
  }

  const [pathname, queryString] = url.split("?");
  const params = new URLSearchParams(queryString || "");
  params.set("share", shareToken);
  const nextQueryString = params.toString();
  return nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
}

function getYearLabel(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})/.exec(value);
  return match ? match[1] : null;
}

function SummaryAvatar({
  mediaId,
  src,
  alt,
}: {
  mediaId: string;
  src: string;
  alt: string;
}) {
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    setHasLoadError(false);
  }, [src]);

  if (hasLoadError) {
    return null;
  }

  return (
    <div className="person-summary-avatar info-rail-avatar">
      <img
        src={src}
        alt={alt}
        onError={() => {
          logMediaError({
            mediaId,
            type: "thumb",
            context: "TreeViewerClient:summary-avatar",
            src,
          });
          setHasLoadError(true);
        }}
      />
    </div>
  );
}

function formatLifeRange(birthDate?: string | null, deathDate?: string | null) {
  const birthYear = getYearLabel(birthDate);
  const deathYear = getYearLabel(deathDate);

  if (birthYear && deathYear) {
    return `${birthYear} — ${deathYear}`;
  }

  if (birthYear) {
    return birthYear;
  }

  if (deathYear) {
    return deathYear;
  }

  if (!birthYear && !deathYear) {
    return null;
  }

  return null;
}

function formatDocumentSize(sizeBytes?: number | null) {
  if (!sizeBytes || sizeBytes <= 0) {
    return null;
  }

  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${sizeBytes} B`;
}

function getDocumentTypeLabel(asset: Pick<TreeSnapshot["media"][number], "title" | "mime_type">) {
  if (asset.mime_type === "application/pdf") {
    return /\.pdf$/i.test(asset.title) ? null : "PDF";
  }

  const extensionMatch = /\.([a-z0-9]+)$/i.exec(asset.title);
  if (extensionMatch) {
    return null;
  }

  if (asset.mime_type?.startsWith("text/")) {
    return "TXT";
  }

  return "Документ";
}

function formatDocumentMeta(asset: Pick<TreeSnapshot["media"][number], "title" | "mime_type" | "size_bytes">) {
  const parts = [getDocumentTypeLabel(asset), formatDocumentSize(asset.size_bytes)].filter(Boolean);
  return parts.join(" • ");
}

function getCollapsedTabNameParts(name?: string | null) {
  const parts = (name || "").split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", lastName: null as string | null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null as string | null };
  }

  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
}

function buildViewerPersonMediaHref(treeSlug: string, personId: string, shareToken?: string | null) {
  const params = new URLSearchParams({
    mode: "photo",
    view: "person",
    personId,
  });

  if (shareToken) {
    params.set("share", shareToken);
  }

  return `/tree/${treeSlug}/media?${params.toString()}`;
}

export function TreeViewerClient({ snapshot, shareToken }: TreeViewerClientProps) {
  const initialSelectedPersonId = snapshot.tree.root_person_id || snapshot.people[0]?.id || null;
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(initialSelectedPersonId);
  const [viewportMode, setViewportMode] = useState<ViewerViewportMode>("desktop");
  const [panelState, setPanelState] = useState<ViewerPanelState>(initialSelectedPersonId ? "collapsed" : "open");
  const [infoRailWidth, setInfoRailWidth] = useState(392);
  const [isResizing, setIsResizing] = useState(false);
  const [collapsedRailHeight, setCollapsedRailHeight] = useState<number | null>(null);
  const [phoneSheetHeight, setPhoneSheetHeight] = useState<number | null>(null);
  const [phoneSheetDragTranslate, setPhoneSheetDragTranslate] = useState<number | null>(null);
  const [isPhoneSheetDragging, setIsPhoneSheetDragging] = useState(false);
  const displayTree = useMemo(() => buildBuilderDisplayTree(snapshot), [snapshot]);
  const generationCount = useMemo(() => countTreeGenerations(snapshot), [snapshot.people, snapshot.parentLinks]);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const infoRailRef = useRef<HTMLDivElement | null>(null);
  const phoneSheetGestureRef = useRef<PhoneSheetGestureState | null>(null);
  const ignoreNextPhoneSheetClickRef = useRef(false);
  const activePhoneSheetPointerIdRef = useRef<number | null>(null);
  const infoRailId = useId();
  const personPhotoPreviewUrls = useMemo(() => {
    const rawUrls = buildPersonPhotoPreviewUrls(snapshot);
    return Object.fromEntries(Object.entries(rawUrls).map(([personId, url]) => [personId, withShareToken(url, shareToken)]));
  }, [shareToken, snapshot.media, snapshot.personMedia]);
  const selectedPerson = snapshot.people.find((person) => person.id === selectedPersonId) || null;
  const effectivePanelState = normalizeViewerPanelState(panelState, Boolean(selectedPerson), viewportMode);
  const isBottomSheetLayout = usesBottomSheetLayout(viewportMode);
  const isSidePanelLayout = usesSidePanelLayout(viewportMode);
  const isTabletPortraitLayout = viewportMode === "tablet-portrait";
  const selectedMedia = selectedPerson ? collectPersonMedia(snapshot, selectedPerson.id) : [];
  const selectedVisualMedia = selectedMedia.filter((asset) => asset.kind !== "document");
  const selectedDocuments = selectedMedia.filter((asset) => asset.kind === "document");
  const personCardPreviewStripLimit = viewportMode === "phone" ? 3 : viewportMode === "tablet-portrait" ? 4 : 5;
  const selectedAvatarUrl = selectedPerson ? personPhotoPreviewUrls[selectedPerson.id] || null : null;
  const selectedPersonLifeRange = selectedPerson ? formatLifeRange(selectedPerson.birth_date, selectedPerson.death_date) : null;
  const collapsedTabName = getCollapsedTabNameParts(selectedPerson?.full_name);
  const phoneSheetPeekTranslate = getPhoneSheetPeekTranslate(phoneSheetHeight);
  const selectedAvatarMediaId =
    selectedPerson
      ? snapshot.personMedia.find(
          (relation) =>
            relation.person_id === selectedPerson.id &&
            relation.is_primary &&
            snapshot.media.some((asset) => asset.id === relation.media_id && asset.kind === "photo")
        )?.media_id || null
      : null;
  const shouldRenderInfoRail = isSidePanelLayout || Boolean(selectedPerson);
  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncViewportMode = () => {
      setViewportMode(getViewerViewportMode(window.innerWidth, window.innerHeight));
    };

    syncViewportMode();
    window.addEventListener("resize", syncViewportMode);

    return () => {
      window.removeEventListener("resize", syncViewportMode);
    };
  }, []);

  useLayoutEffect(() => {
    setPanelState((currentState) => normalizeViewerPanelState(currentState, Boolean(selectedPerson), viewportMode));
  }, [selectedPerson, viewportMode]);

  useEffect(() => {
    setIsPhoneSheetDragging(false);
    setPhoneSheetDragTranslate(null);
    phoneSheetGestureRef.current = null;
    ignoreNextPhoneSheetClickRef.current = false;
    activePhoneSheetPointerIdRef.current = null;
  }, [selectedPersonId, viewportMode]);

  useEffect(() => {
    if (!isResizing) {
      return undefined;
    }

    function handlePointerMove(event: PointerEvent) {
      if (!layoutRef.current) {
        return;
      }

      const rect = layoutRef.current.getBoundingClientRect();
      const nextWidth = rect.right - event.clientX;
      const maxWidth = Math.min(720, Math.max(360, rect.width - 320));
      setInfoRailWidth(Math.max(320, Math.min(maxWidth, nextWidth)));
    }

    function handlePointerUp() {
      setIsResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const infoRailElement = infoRailRef.current;
    if (!infoRailElement) {
      return undefined;
    }

    function handleNativeTouchStart(event: TouchEvent) {
      if (!canStartPhoneSheetGesture(event.target)) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      beginPhoneSheetGesture(touch.clientX, touch.clientY);
    }

    function handleNativeTouchMove(event: TouchEvent) {
      const gesture = phoneSheetGestureRef.current;
      const touch = event.touches[0];
      if (!gesture || !touch) {
        return;
      }

      updatePhoneSheetGesture(touch.clientX, touch.clientY);

      if (phoneSheetGestureRef.current?.axis === "vertical") {
        event.preventDefault();
      }
    }

    function handleNativeTouchEnd(event: TouchEvent) {
      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }

      if (phoneSheetGestureRef.current?.axis === "vertical") {
        event.preventDefault();
      }

      completePhoneSheetGesture(touch.clientX, touch.clientY);
    }

    function handleNativeTouchCancel() {
      activePhoneSheetPointerIdRef.current = null;
      phoneSheetGestureRef.current = null;
      setIsPhoneSheetDragging(false);
      setPhoneSheetDragTranslate(null);
    }

    infoRailElement.addEventListener("touchstart", handleNativeTouchStart, { passive: false });
    infoRailElement.addEventListener("touchmove", handleNativeTouchMove, { passive: false });
    infoRailElement.addEventListener("touchend", handleNativeTouchEnd, { passive: false });
    infoRailElement.addEventListener("touchcancel", handleNativeTouchCancel, { passive: false });

    return () => {
      infoRailElement.removeEventListener("touchstart", handleNativeTouchStart);
      infoRailElement.removeEventListener("touchmove", handleNativeTouchMove);
      infoRailElement.removeEventListener("touchend", handleNativeTouchEnd);
      infoRailElement.removeEventListener("touchcancel", handleNativeTouchCancel);
    };
  }, [effectivePanelState, selectedPerson, viewportMode]);

  useLayoutEffect(() => {
    const infoRailElement = infoRailRef.current;

    if (!infoRailElement) {
      return undefined;
    }

    const stableInfoRailElement = infoRailElement;
    let frameId: number | null = null;

    function updateCollapsedRailHeight() {
      const nextHeight = Math.round(stableInfoRailElement.getBoundingClientRect().height);
      const normalizedHeight = nextHeight > 0 ? nextHeight : null;
      setCollapsedRailHeight((currentHeight) => {
        return currentHeight === normalizedHeight ? currentHeight : normalizedHeight;
      });
      setPhoneSheetHeight((currentHeight) => (currentHeight === normalizedHeight ? currentHeight : normalizedHeight));
    }

    function scheduleCollapsedRailHeightUpdate() {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateCollapsedRailHeight();
      });
    }

    updateCollapsedRailHeight();
    scheduleCollapsedRailHeightUpdate();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleCollapsedRailHeightUpdate();
          });

    resizeObserver?.observe(stableInfoRailElement);
    window.addEventListener("resize", scheduleCollapsedRailHeightUpdate);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleCollapsedRailHeightUpdate);
    };
  }, [infoRailId, infoRailWidth, selectedPersonId]);

  function handleSelectPerson(personId: string) {
    setSelectedPersonId(personId);
    setPanelState(isBottomSheetLayout ? "peek" : "open");
  }

  function handleTogglePanel() {
    setPanelState((currentState) => {
      const normalizedState = normalizeViewerPanelState(currentState, Boolean(selectedPerson), viewportMode);

      if (usesBottomSheetLayout(viewportMode)) {
        return normalizedState === "open" ? "peek" : "open";
      }

      return normalizedState === "open" ? "collapsed" : "open";
    });
  }

  function canStartPhoneSheetGesture(target: EventTarget | null) {
    if (!selectedPerson || !isBottomSheetLayout) {
      return false;
    }

    if (isPhoneSheetHandleTarget(target)) {
      return true;
    }

    if (effectivePanelState !== "open") {
      return false;
    }

    if (isPhoneSheetInteractiveTarget(target)) {
      return false;
    }

    return (infoRailRef.current?.scrollTop ?? 0) <= 4;
  }

  function beginPhoneSheetGesture(clientX: number, clientY: number) {
    if (!isBottomSheetLayout || !selectedPerson) {
      return;
    }

    const measuredSheetHeight = Math.round(infoRailRef.current?.getBoundingClientRect().height || 0);
    if (measuredSheetHeight > 0) {
      setPhoneSheetHeight((currentHeight) => (currentHeight === measuredSheetHeight ? currentHeight : measuredSheetHeight));
    }

    const peekTranslate = getPhoneSheetPeekTranslate(measuredSheetHeight || phoneSheetHeight);
    const now = performance.now();
    phoneSheetGestureRef.current = {
      x: clientX,
      y: clientY,
      scrollTop: infoRailRef.current?.scrollTop ?? 0,
      startTime: now,
      lastTime: now,
      lastY: clientY,
      velocityY: 0,
      startTranslate: effectivePanelState === "open" ? 0 : peekTranslate,
      currentTranslate: effectivePanelState === "open" ? 0 : peekTranslate,
      peekTranslate,
      axis: null,
      didDrag: false,
    };
  }

  function updatePhoneSheetGesture(clientX: number, clientY: number) {
    const gesture = phoneSheetGestureRef.current;
    if (!isBottomSheetLayout || !selectedPerson || !gesture) {
      return;
    }

    const deltaX = clientX - gesture.x;
    const deltaY = clientY - gesture.y;

    if (!gesture.axis) {
      if (Math.abs(deltaX) < PHONE_VIEWER_DRAG_START_THRESHOLD && Math.abs(deltaY) < PHONE_VIEWER_DRAG_START_THRESHOLD) {
        return;
      }

      gesture.axis = Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";
    }

    if (gesture.axis !== "vertical" || Math.abs(deltaX) > PHONE_VIEWER_SWIPE_MAX_HORIZONTAL) {
      return;
    }

    const sheetScrollTop = infoRailRef.current?.scrollTop ?? 0;
    if (effectivePanelState === "open" && gesture.scrollTop > 4 && sheetScrollTop > 4 && deltaY > 0) {
      return;
    }

    const nextTranslate = Math.max(0, Math.min(gesture.peekTranslate, gesture.startTranslate + deltaY));
    if (nextTranslate === gesture.startTranslate && Math.abs(deltaY) < PHONE_VIEWER_DRAG_START_THRESHOLD) {
      return;
    }

    gesture.didDrag = true;
    const now = performance.now();
    const deltaTime = Math.max(now - gesture.lastTime, 1);
    const instantaneousVelocityY = (clientY - gesture.lastY) / deltaTime;
    gesture.velocityY = instantaneousVelocityY;
    gesture.lastTime = now;
    gesture.lastY = clientY;
    gesture.currentTranslate = nextTranslate;
    setIsPhoneSheetDragging(true);
    setPhoneSheetDragTranslate(nextTranslate);
  }

  function completePhoneSheetGesture(clientX: number, clientY: number) {
    if (!isBottomSheetLayout || !selectedPerson) {
      setIsPhoneSheetDragging(false);
      setPhoneSheetDragTranslate(null);
      phoneSheetGestureRef.current = null;
      return;
    }

    const gesture = phoneSheetGestureRef.current;
    phoneSheetGestureRef.current = null;

    if (!gesture) {
      setIsPhoneSheetDragging(false);
      setPhoneSheetDragTranslate(null);
      return;
    }

    const deltaX = clientX - gesture.x;
    const deltaY = clientY - gesture.y;
    const sheetScrollTop = infoRailRef.current?.scrollTop ?? 0;
    const startedAtTop = gesture.scrollTop <= 4;
    const endedAtTop = sheetScrollTop <= 4;
    const totalTime = Math.max(performance.now() - gesture.startTime, 1);
    const overallVelocityY = deltaY / totalTime;
    const releaseVelocityY =
      Math.abs(gesture.velocityY) > Math.abs(overallVelocityY) ? gesture.velocityY : overallVelocityY;
    const velocityOverride = Math.abs(releaseVelocityY) >= PHONE_VIEWER_SWIPE_VELOCITY_THRESHOLD;
    const distanceOverride = Math.abs(deltaY) >= PHONE_VIEWER_SWIPE_THRESHOLD;

    if (gesture.didDrag || velocityOverride || distanceOverride) {
      ignoreNextPhoneSheetClickRef.current = true;
      setIsPhoneSheetDragging(false);
      setPhoneSheetDragTranslate(null);
      setPanelState(
        velocityOverride
          ? releaseVelocityY < 0
            ? "open"
            : "peek"
          : gesture.currentTranslate <= gesture.peekTranslate * PHONE_VIEWER_SETTLE_DISTANCE_RATIO
            ? "open"
            : "peek"
      );
      return;
    }

    setIsPhoneSheetDragging(false);
    setPhoneSheetDragTranslate(null);

    if (Math.abs(deltaX) > PHONE_VIEWER_SWIPE_MAX_HORIZONTAL || Math.abs(deltaY) < PHONE_VIEWER_SWIPE_THRESHOLD) {
      return;
    }

    if (deltaY < 0 && effectivePanelState !== "open") {
      ignoreNextPhoneSheetClickRef.current = true;
      setPanelState("open");
      return;
    }

    if (deltaY > 0 && effectivePanelState === "open" && startedAtTop && endedAtTop) {
      ignoreNextPhoneSheetClickRef.current = true;
      setPanelState("peek");
    }
  }

  function handlePhoneSheetPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch" || !isBottomSheetLayout || !selectedPerson) {
      return;
    }

    if (!canStartPhoneSheetGesture(event.target)) {
      return;
    }

    activePhoneSheetPointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic browser checks may not create an active pointer capture target.
    }
    beginPhoneSheetGesture(event.clientX, event.clientY);
  }

  function handlePhoneSheetPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (
      event.pointerType === "touch" ||
      !isBottomSheetLayout ||
      !selectedPerson ||
      activePhoneSheetPointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    updatePhoneSheetGesture(event.clientX, event.clientY);
  }

  function handlePhoneSheetPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (
      event.pointerType === "touch" ||
      !isBottomSheetLayout ||
      !selectedPerson ||
      activePhoneSheetPointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Synthetic browser checks may not hold pointer capture.
    }
    activePhoneSheetPointerIdRef.current = null;
    completePhoneSheetGesture(event.clientX, event.clientY);
  }

  const canResizeRail = viewportMode === "desktop" && effectivePanelState === "open";
  const phoneSheetDragProgress =
    isPhoneSheetDragging && typeof phoneSheetDragTranslate === "number" && phoneSheetPeekTranslate > 0
      ? 1 - phoneSheetDragTranslate / phoneSheetPeekTranslate
      : null;
  const phoneSheetStyle =
    isBottomSheetLayout && isPhoneSheetDragging && typeof phoneSheetDragTranslate === "number"
      ? ({
          transform: `translateY(${phoneSheetDragTranslate}px)`,
          transition: "none",
          overflow: "hidden",
        } as CSSProperties)
      : undefined;
  const phoneSheetBodyStyle =
    isBottomSheetLayout && phoneSheetDragProgress !== null
      ? ({
          opacity: phoneSheetDragProgress,
          visibility: phoneSheetDragProgress <= 0.02 ? "hidden" : "visible",
          pointerEvents: phoneSheetDragProgress >= 0.98 ? "auto" : "none",
        } as CSSProperties)
      : undefined;
  const toggleLabel =
    effectivePanelState === "open"
      ? `Свернуть карточку человека: ${selectedPerson?.full_name || ""}`
      : isBottomSheetLayout
        ? `Развернуть карточку человека: ${selectedPerson?.full_name || ""}`
        : `Открыть карточку человека: ${selectedPerson?.full_name || ""}`;

  return (
    <div
      ref={layoutRef}
      className={`viewer-layout viewer-layout-overlay viewer-layout-resizable viewer-panel-${effectivePanelState}${isResizing ? " viewer-layout-resizing" : ""}`}
      data-viewport-mode={viewportMode}
      data-panel-state={effectivePanelState}
      style={
        {
          "--viewer-rail-width": `${infoRailWidth}px`,
          ...(collapsedRailHeight !== null ? { "--viewer-collapsed-rail-height": `${collapsedRailHeight}px` } : {}),
        } as CSSProperties
      }
    >
      <Card className="viewer-stage viewer-stage-canvas">
        <TreeOverlay
          className="viewer-tree-overlay"
          title={snapshot.tree.title}
          peopleCount={snapshot.people.length}
          generationCount={generationCount}
        />
        <FamilyTreeCanvas
          tree={displayTree}
          selectedPersonId={selectedPersonId}
          onSelectPerson={handleSelectPerson}
          displayMode="builder"
          people={snapshot.people}
          parentLinks={snapshot.parentLinks}
          partnerships={snapshot.partnerships}
          personPhotoUrls={personPhotoPreviewUrls}
          viewportInsetTop={isBottomSheetLayout ? PHONE_VIEWER_CANVAS_INSET_TOP : 0}
          viewportInsetBottom={isBottomSheetLayout ? PHONE_VIEWER_CANVAS_INSET_BOTTOM : 0}
          viewportMarginX={
            viewportMode === "phone"
              ? PHONE_VIEWER_CANVAS_MARGIN_X
              : isTabletPortraitLayout
                ? TABLET_VIEWER_CANVAS_MARGIN_X
                : undefined
          }
          viewportMarginY={
            viewportMode === "phone"
              ? PHONE_VIEWER_CANVAS_MARGIN_Y
              : isTabletPortraitLayout
                ? TABLET_VIEWER_CANVAS_MARGIN_Y
                : undefined
          }
          preferInitialBoundsFit={viewportMode === "phone"}
          preferInitialSelectedFocus={isTabletPortraitLayout}
          selectedMinScale={isTabletPortraitLayout ? TABLET_VIEWER_SELECTED_MIN_SCALE : undefined}
        />
      </Card>
      {canResizeRail ? (
        <div
          className="viewer-rail-resize-handle"
          aria-label="Изменить ширину карточки человека"
          role="separator"
          onPointerDown={(event) => {
            event.preventDefault();
            setIsResizing(true);
          }}
        />
      ) : null}

      {shouldRenderInfoRail ? (
        <Card
          ref={infoRailRef}
          id={infoRailId}
          className="info-rail viewer-info-rail utility-section-card p-6"
          data-viewport-mode={viewportMode}
          data-panel-state={effectivePanelState}
          data-dragging={isPhoneSheetDragging ? "true" : "false"}
          style={phoneSheetStyle}
          onPointerDown={handlePhoneSheetPointerDown}
          onPointerMove={handlePhoneSheetPointerMove}
          onPointerUp={handlePhoneSheetPointerUp}
          onPointerCancel={() => {
            activePhoneSheetPointerIdRef.current = null;
            phoneSheetGestureRef.current = null;
            setIsPhoneSheetDragging(false);
            setPhoneSheetDragTranslate(null);
          }}
          onClick={() => {
            if (ignoreNextPhoneSheetClickRef.current) {
              ignoreNextPhoneSheetClickRef.current = false;
              return;
            }

            if (isBottomSheetLayout && selectedPerson && effectivePanelState !== "open") {
              setPanelState("open");
            }
          }}
        >
          {isBottomSheetLayout && selectedPerson ? (
            <button
              type="button"
              className="viewer-phone-sheet-toggle"
              aria-label={toggleLabel}
              aria-expanded={effectivePanelState === "open"}
              onClick={(event) => {
                event.stopPropagation();
                if (ignoreNextPhoneSheetClickRef.current) {
                  ignoreNextPhoneSheetClickRef.current = false;
                  return;
                }
                handleTogglePanel();
              }}
            >
              <span className="viewer-phone-sheet-grip" aria-hidden="true" />
              <span className="viewer-phone-sheet-copy">
                <span className="viewer-phone-sheet-title">{selectedPerson.full_name}</span>
              </span>
            </button>
          ) : null}
          {selectedPerson ? (
            <>
              <div className="viewer-info-rail-body" style={phoneSheetBodyStyle}>
                <div className="viewer-info-rail-header">
                  <div className="viewer-person-summary utility-note-card">
                    <div className="viewer-person-summary-copy">
                      <h2 className="card-heading">{selectedPerson.full_name}</h2>
                      {selectedPersonLifeRange ? <p className="viewer-person-summary-dates">{selectedPersonLifeRange}</p> : null}
                    </div>
                    {selectedAvatarUrl && selectedAvatarMediaId ? (
                      <SummaryAvatar
                        mediaId={selectedAvatarMediaId}
                        src={selectedAvatarUrl}
                        alt={`Портрет: ${selectedPerson.full_name}`}
                      />
                    ) : null}
                  </div>
                </div>
              {selectedPerson.bio ? (
                <div className="detail-list viewer-person-detail-list">
                  <div className="viewer-person-bio-block">
                    <span className="viewer-person-bio">{selectedPerson.bio}</span>
                  </div>
                </div>
              ) : null}

                {selectedVisualMedia.length ? (
                  <div className="media-strip viewer-person-media-strip">
                    <PersonMediaGallery
                      media={selectedVisualMedia}
                      shareToken={shareToken}
                      avatarMediaId={selectedAvatarMediaId}
                      showStage={false}
                      showStickyFooter={false}
                      compactPreviewEntry
                      previewStripLimit={personCardPreviewStripLimit}
                      emptyTitle="Материалы еще не добавлены"
                      emptyMessage="Когда для этого человека появятся фотографии или видео, они будут собраны здесь в спокойной галерее."
                    />
                    <div className="action-row">
                      <a
                        href={buildViewerPersonMediaHref(snapshot.tree.slug, selectedPerson.id, shareToken)}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Посмотреть медиа
                      </a>
                    </div>
                  </div>
                ) : selectedDocuments.length ? null : (
                  <div className="media-strip viewer-person-media-strip">
                    <PersonMediaGallery
                      media={selectedVisualMedia}
                      shareToken={shareToken}
                      avatarMediaId={selectedAvatarMediaId}
                      showStage={false}
                      showStickyFooter={false}
                      compactPreviewEntry
                      previewStripLimit={personCardPreviewStripLimit}
                      emptyTitle="Материалы еще не добавлены"
                      emptyMessage="Когда для этого человека появятся фотографии или видео, они будут собраны здесь в спокойной галерее."
                    />
                  </div>
                )}

                {selectedDocuments.length ? (
                  <section className="viewer-person-documents" aria-label="Документы">
                    <h3 className="viewer-person-documents-title">Документы</h3>
                    <div className="viewer-person-document-list">
                      {selectedDocuments.map((asset) => (
                        <a
                          key={asset.id}
                          href={buildMediaOpenRouteUrl(asset, shareToken)}
                          target="_blank"
                          rel="noreferrer"
                          className="viewer-person-document-link"
                        >
                          <span className="viewer-person-document-icon" aria-hidden="true">
                            <FileText className="viewer-person-document-icon-svg" />
                          </span>
                          <span className="viewer-person-document-copy">
                            <strong>{asset.title}</strong>
                            <span>{formatDocumentMeta(asset)}</span>
                          </span>
                        </a>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty-state">Выберите человека, чтобы посмотреть его данные.</div>
          )}
        </Card>
      ) : null}
      {selectedPerson && isSidePanelLayout ? (
        <button
          type="button"
          className="viewer-info-rail-tab"
          aria-controls={infoRailId}
          aria-expanded={effectivePanelState === "open"}
          aria-label={toggleLabel}
          onClick={handleTogglePanel}
        >
          <span className="viewer-info-rail-tab-icon" aria-hidden="true">
            <ArrowLeft className="viewer-info-rail-tab-icon-svg" />
          </span>
          <span className="viewer-info-rail-tab-name" title={selectedPerson.full_name}>
            <span className="viewer-info-rail-tab-name-line viewer-info-rail-tab-name-line-primary">{collapsedTabName.firstName}</span>
            {collapsedTabName.lastName ? (
              <span className="viewer-info-rail-tab-name-line viewer-info-rail-tab-name-line-secondary">{collapsedTabName.lastName}</span>
            ) : null}
          </span>
          </button>
        ) : null}
    </div>
  );
}
