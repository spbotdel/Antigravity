import type { ReactNode } from "react";

import { formatTreeMeta } from "@/lib/ui-text";

interface TreeOverlayProps {
  title: string;
  peopleCount: number;
  generationCount: number;
  label?: string;
  className?: string;
  interactive?: boolean;
  titleSlot?: ReactNode;
}

export function TreeOverlay({ title, peopleCount, generationCount, label, className, interactive = false, titleSlot }: TreeOverlayProps) {
  const rootClassName = ["tree-overlay", interactive ? "tree-overlay-interactive" : null, className].filter(Boolean).join(" ");

  return (
    <div className={rootClassName}>
      {label ? <p className="tree-overlay-label">{label}</p> : null}
      {titleSlot || <h2 className="tree-overlay-title">{title}</h2>}
      <p className="tree-overlay-meta">{formatTreeMeta(peopleCount, generationCount)}</p>
    </div>
  );
}
