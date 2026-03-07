"use client";

import { useMemo, useState } from "react";

import { FamilyTreeCanvas } from "@/components/tree/family-tree-canvas";
import { PersonMediaGallery } from "@/components/tree/person-media-gallery";
import { buildBuilderDisplayTree, buildPersonPhotoPreviewUrls, collectPersonMedia } from "@/lib/tree/display";
import { formatGender } from "@/lib/ui-text";
import { formatDate } from "@/lib/utils";
import type { TreeSnapshot } from "@/lib/types";

interface TreeViewerClientProps {
  snapshot: TreeSnapshot;
  shareToken?: string | null;
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

export function TreeViewerClient({ snapshot, shareToken }: TreeViewerClientProps) {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(snapshot.tree.root_person_id || snapshot.people[0]?.id || null);
  const displayTree = useMemo(() => buildBuilderDisplayTree(snapshot), [snapshot]);
  const personPhotoPreviewUrls = useMemo(() => {
    const rawUrls = buildPersonPhotoPreviewUrls(snapshot);
    return Object.fromEntries(Object.entries(rawUrls).map(([personId, url]) => [personId, withShareToken(url, shareToken)]));
  }, [shareToken, snapshot.media, snapshot.personMedia]);
  const selectedPerson = snapshot.people.find((person) => person.id === selectedPersonId) || null;
  const selectedMedia = selectedPerson ? collectPersonMedia(snapshot, selectedPerson.id) : [];

  return (
    <div className="viewer-layout">
      <div className="surface-card viewer-stage viewer-stage-canvas">
        <div className="stage-header viewer-stage-header-overlay">
          <div className="stage-header-copy">
            <p className="stage-kicker">Схема семьи</p>
            <h2>Главная структура дерева</h2>
          </div>
          <p className="stage-hint">Перетаскивайте схему мышью и масштабируйте колесиком, чтобы спокойно просматривать ветви.</p>
        </div>
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
      </div>

      <aside className="surface-card info-rail">
        {selectedPerson ? (
          <>
            <p className="eyebrow">Выбранный человек</p>
            <h2>{selectedPerson.full_name}</h2>
            <div className="detail-list">
              <div>
                <strong>Пол</strong>
                <span>{formatGender(selectedPerson.gender)}</span>
              </div>
              <div>
                <strong>Дата рождения</strong>
                <span>{formatDate(selectedPerson.birth_date) || "Не указана"}</span>
              </div>
              <div>
                <strong>Дата смерти</strong>
                <span>{formatDate(selectedPerson.death_date) || "Жив(а) или не указано"}</span>
              </div>
              <div>
                <strong>Место рождения</strong>
                <span>{selectedPerson.birth_place || "Не указано"}</span>
              </div>
              <div>
                <strong>История</strong>
                <span>{selectedPerson.bio || "История пока не добавлена."}</span>
              </div>
            </div>

            <div className="media-strip">
              <PersonMediaGallery media={selectedMedia} shareToken={shareToken} />
            </div>
          </>
        ) : (
          <div className="empty-state">Выберите человека, чтобы посмотреть его данные.</div>
        )}
      </aside>
    </div>
  );
}
