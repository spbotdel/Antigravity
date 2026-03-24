"use client";

import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { FamilyTreeCanvas } from "@/components/tree/family-tree-canvas";
import { PersonMediaGallery } from "@/components/tree/person-media-gallery";
import { buildBuilderDisplayTree, buildMediaOpenRouteUrl, buildPersonPhotoPreviewUrls, collectPersonMedia } from "@/lib/tree/display";
import type { TreeSnapshot } from "@/lib/types";

interface TreeViewerClientProps {
  snapshot: TreeSnapshot;
  shareToken?: string | null;
  nav?: ReactNode;
}

type ViewerPanelState = "collapsed" | "open";

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

export function TreeViewerClient({ snapshot, shareToken, nav = null }: TreeViewerClientProps) {
  const initialSelectedPersonId = snapshot.tree.root_person_id || snapshot.people[0]?.id || null;
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(initialSelectedPersonId);
  const [panelState, setPanelState] = useState<ViewerPanelState>(initialSelectedPersonId ? "collapsed" : "open");
  const [infoRailWidth, setInfoRailWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const [collapsedRailHeight, setCollapsedRailHeight] = useState<number | null>(null);
  const displayTree = useMemo(() => buildBuilderDisplayTree(snapshot), [snapshot]);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const infoRailRef = useRef<HTMLDivElement | null>(null);
  const infoRailId = useId();
  const personPhotoPreviewUrls = useMemo(() => {
    const rawUrls = buildPersonPhotoPreviewUrls(snapshot);
    return Object.fromEntries(Object.entries(rawUrls).map(([personId, url]) => [personId, withShareToken(url, shareToken)]));
  }, [shareToken, snapshot.media, snapshot.personMedia]);
  const selectedPerson = snapshot.people.find((person) => person.id === selectedPersonId) || null;
  const effectivePanelState: ViewerPanelState = selectedPerson && panelState === "collapsed" ? "collapsed" : "open";
  const selectedMedia = selectedPerson ? collectPersonMedia(snapshot, selectedPerson.id) : [];
  const selectedVisualMedia = selectedMedia.filter((asset) => asset.kind !== "document");
  const selectedDocuments = selectedMedia.filter((asset) => asset.kind === "document");
  const selectedAvatarUrl = selectedPerson ? personPhotoPreviewUrls[selectedPerson.id] || null : null;
  const selectedPersonLifeRange = selectedPerson ? formatLifeRange(selectedPerson.birth_date, selectedPerson.death_date) : null;
  const collapsedTabName = getCollapsedTabNameParts(selectedPerson?.full_name);
  const selectedAvatarMediaId =
    selectedPerson
      ? snapshot.personMedia.find(
          (relation) =>
            relation.person_id === selectedPerson.id &&
            relation.is_primary &&
            snapshot.media.some((asset) => asset.id === relation.media_id && asset.kind === "photo")
        )?.media_id || null
      : null;

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

  useLayoutEffect(() => {
    const infoRailElement = infoRailRef.current;

    if (!infoRailElement) {
      return undefined;
    }

    const stableInfoRailElement = infoRailElement;
    let frameId: number | null = null;

    function updateCollapsedRailHeight() {
      const nextHeight = Math.round(stableInfoRailElement.getBoundingClientRect().height);
      setCollapsedRailHeight((currentHeight) => {
        const normalizedHeight = nextHeight > 0 ? nextHeight : null;
        return currentHeight === normalizedHeight ? currentHeight : normalizedHeight;
      });
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
    setPanelState("open");
  }

  function handleTogglePanel() {
    setPanelState((currentState) => (currentState === "open" ? "collapsed" : "open"));
  }

  const toggleLabel =
    effectivePanelState === "open"
      ? `Свернуть карточку человека: ${selectedPerson?.full_name || ""}`
      : `Открыть карточку человека: ${selectedPerson?.full_name || ""}`;

  return (
    <div
      ref={layoutRef}
      className={`viewer-layout viewer-layout-overlay viewer-layout-resizable viewer-panel-${effectivePanelState}${isResizing ? " viewer-layout-resizing" : ""}`}
      style={
        {
          "--viewer-rail-width": `${infoRailWidth}px`,
          ...(collapsedRailHeight !== null ? { "--viewer-collapsed-rail-height": `${collapsedRailHeight}px` } : {}),
        } as CSSProperties
      }
    >
      <Card className="viewer-stage viewer-stage-canvas">
        <FamilyTreeCanvas
          tree={displayTree}
          selectedPersonId={selectedPersonId}
          onSelectPerson={handleSelectPerson}
          displayMode="builder"
          people={snapshot.people}
          parentLinks={snapshot.parentLinks}
          partnerships={snapshot.partnerships}
          personPhotoUrls={personPhotoPreviewUrls}
        />
      </Card>

      {nav ? <div className="viewer-nav-overlay">{nav}</div> : null}

      {effectivePanelState === "open" ? (
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

      <Card ref={infoRailRef} id={infoRailId} className="info-rail viewer-info-rail utility-section-card p-6">
        {selectedPerson ? (
          <>
            <div className="viewer-info-rail-body">
              <div className="viewer-info-rail-header">
                <div className="viewer-person-summary utility-note-card">
                  <div className="viewer-person-summary-copy">
                    <h2 className="card-heading">{selectedPerson.full_name}</h2>
                    {selectedPersonLifeRange ? <p className="viewer-person-summary-dates">{selectedPersonLifeRange}</p> : null}
                  </div>
                  {selectedAvatarUrl ? (
                    <div className="person-summary-avatar info-rail-avatar">
                      <img src={selectedAvatarUrl} alt={`Портрет: ${selectedPerson.full_name}`} />
                    </div>
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
                    emptyTitle="Материалы еще не добавлены"
                    emptyMessage="Когда для этого человека появятся фотографии или видео, они будут собраны здесь в спокойной галерее."
                  />
                </div>
              ) : selectedDocuments.length ? null : (
                <div className="media-strip viewer-person-media-strip">
                  <PersonMediaGallery
                    media={selectedVisualMedia}
                    shareToken={shareToken}
                    avatarMediaId={selectedAvatarMediaId}
                    showStage={false}
                    showStickyFooter={false}
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
      {selectedPerson ? (
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
