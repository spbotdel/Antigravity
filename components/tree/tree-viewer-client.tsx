"use client";

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { Card } from "@/components/ui/card";
import { FamilyTreeCanvas } from "@/components/tree/family-tree-canvas";
import { PersonMediaGallery } from "@/components/tree/person-media-gallery";
import { buildBuilderDisplayTree, buildPersonPhotoPreviewUrls, collectPersonMedia } from "@/lib/tree/display";
import { formatGender } from "@/lib/ui-text";
import { formatDate } from "@/lib/utils";
import type { TreeSnapshot } from "@/lib/types";

interface TreeViewerClientProps {
  snapshot: TreeSnapshot;
  shareToken?: string | null;
  nav?: ReactNode;
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

export function TreeViewerClient({ snapshot, shareToken, nav = null }: TreeViewerClientProps) {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(snapshot.tree.root_person_id || snapshot.people[0]?.id || null);
  const [infoRailWidth, setInfoRailWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const displayTree = useMemo(() => buildBuilderDisplayTree(snapshot), [snapshot]);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const personPhotoPreviewUrls = useMemo(() => {
    const rawUrls = buildPersonPhotoPreviewUrls(snapshot);
    return Object.fromEntries(Object.entries(rawUrls).map(([personId, url]) => [personId, withShareToken(url, shareToken)]));
  }, [shareToken, snapshot.media, snapshot.personMedia]);
  const selectedPerson = snapshot.people.find((person) => person.id === selectedPersonId) || null;
  const selectedMedia = selectedPerson ? collectPersonMedia(snapshot, selectedPerson.id) : [];
  const selectedAvatarUrl = selectedPerson ? personPhotoPreviewUrls[selectedPerson.id] || null : null;
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

  return (
    <div
      ref={layoutRef}
      className={`viewer-layout viewer-layout-overlay viewer-layout-resizable${isResizing ? " viewer-layout-resizing" : ""}`}
      style={{ "--viewer-rail-width": `${infoRailWidth}px` } as CSSProperties}
    >
      <Card className="viewer-stage viewer-stage-canvas">
        <FamilyTreeCanvas
          tree={displayTree}
          selectedPersonId={selectedPersonId}
          onSelectPerson={setSelectedPersonId}
          displayMode="builder"
          people={snapshot.people}
          parentLinks={snapshot.parentLinks}
          partnerships={snapshot.partnerships}
          personPhotoUrls={personPhotoPreviewUrls}
        />
      </Card>

      {nav ? <div className="viewer-nav-overlay">{nav}</div> : null}

      <div
        className="viewer-rail-resize-handle"
        aria-label="Изменить ширину карточки человека"
        role="separator"
        onPointerDown={(event) => {
          event.preventDefault();
          setIsResizing(true);
        }}
      />

      <Card className="info-rail viewer-info-rail utility-section-card p-6">
        {selectedPerson ? (
          <>
            <div className="viewer-person-summary utility-note-card">
              <div className="viewer-person-summary-copy">
                <h2 className="card-heading">{selectedPerson.full_name}</h2>
                <div className="builder-inspector-badges">
                  <span className="members-static-note">{formatGender(selectedPerson.gender)}</span>
                </div>
              </div>
              {selectedAvatarUrl ? (
                <div className="person-summary-avatar info-rail-avatar">
                  <img src={selectedAvatarUrl} alt={`Портрет: ${selectedPerson.full_name}`} />
                </div>
              ) : null}
            </div>
            <div className="detail-list">
              <div>
                <strong>Пол</strong>
                <span>{formatGender(selectedPerson.gender)}</span>
              </div>
              <div className="detail-list-row detail-list-row-dates">
                <div className="detail-date-item">
                  <strong>Дата рождения</strong>
                  <span>{formatDate(selectedPerson.birth_date) || "Не указана"}</span>
                </div>
                <div className="detail-date-item">
                  <strong>Дата смерти</strong>
                  <span>{formatDate(selectedPerson.death_date) || "Не указана"}</span>
                </div>
              </div>
              <div>
                <strong>Био</strong>
                <span>{selectedPerson.bio || "Био пока не добавлено."}</span>
              </div>
            </div>

            <div className="media-strip">
              <PersonMediaGallery
                media={selectedMedia}
                shareToken={shareToken}
                avatarMediaId={selectedAvatarMediaId}
                showStage={false}
                showStickyFooter={false}
                emptyTitle="Материалы еще не добавлены"
                emptyMessage="Когда для этого человека появятся фотографии или видео, они будут собраны здесь в спокойной галерее."
              />
            </div>
          </>
        ) : (
          <div className="empty-state">Выберите человека, чтобы посмотреть его данные.</div>
        )}
      </Card>
    </div>
  );
}
