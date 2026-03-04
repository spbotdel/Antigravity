"use client";

import { useMemo, useState } from "react";

import { FamilyTreeCanvas } from "@/components/tree/family-tree-canvas";
import { buildDisplayTree, collectPersonMedia } from "@/lib/tree/display";
import { formatGender, formatMediaKind, formatMediaVisibility } from "@/lib/ui-text";
import { formatDate } from "@/lib/utils";
import type { TreeSnapshot } from "@/lib/types";

interface TreeViewerClientProps {
  snapshot: TreeSnapshot;
}

export function TreeViewerClient({ snapshot }: TreeViewerClientProps) {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(snapshot.tree.root_person_id || snapshot.people[0]?.id || null);
  const displayTree = useMemo(() => buildDisplayTree(snapshot), [snapshot]);
  const selectedPerson = snapshot.people.find((person) => person.id === selectedPersonId) || null;
  const selectedMedia = selectedPerson ? collectPersonMedia(snapshot, selectedPerson.id) : [];

  return (
    <div className="viewer-layout">
      <div className="surface-card viewer-stage">
        <div className="stage-header">
          <div className="stage-header-copy">
            <p className="stage-kicker">Схема семьи</p>
            <h2>Главная структура дерева</h2>
          </div>
          <p className="stage-hint">Перетаскивайте схему мышью и масштабируйте колесиком, чтобы спокойно просматривать ветви.</p>
        </div>
        <FamilyTreeCanvas tree={displayTree} selectedPersonId={selectedPersonId} onSelectPerson={setSelectedPersonId} />
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
              {selectedMedia.length ? (
                selectedMedia.map((asset) => (
                  <article key={asset.id} className="media-card">
                    <div className="media-meta">
                      <span>{formatMediaKind(asset.kind)}</span>
                      <span>{formatMediaVisibility(asset.visibility)}</span>
                    </div>
                    {asset.kind === "photo" ? (
                      <img src={`/api/media/${asset.id}`} alt={asset.title} className="media-photo" />
                    ) : (
                      <a href={`/api/media/${asset.id}`} target="_blank" rel="noreferrer" className="ghost-button">
                        Открыть видео на Яндекс Диске
                      </a>
                    )}
                    <h4>{asset.title}</h4>
                    <p>{asset.caption || "Подпись не добавлена."}</p>
                  </article>
                ))
              ) : (
                <div className="empty-state">Для этого человека пока не добавлено медиа.</div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">Выберите человека, чтобы посмотреть его данные.</div>
        )}
      </aside>
    </div>
  );
}
