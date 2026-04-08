"use client";

import { type CSSProperties } from "react";

import styles from "./family-tree-scroll-stage.module.css";

interface FamilyTreeScrollStageProps {
  baseProgress: number;
  baseSrc: string;
  leavesStageOneProgress: number;
  leavesStageOneSrc: string;
  leavesProgress: number;
  leavesSrc: string;
  mode: "interactive" | "manual" | "static";
  peopleStageOneProgress: number;
  peopleStageOneSrc: string;
  peopleProgress: number;
  peopleSrc: string;
}

export function FamilyTreeScrollStage({
  baseProgress,
  baseSrc,
  leavesStageOneProgress,
  leavesStageOneSrc,
  leavesProgress,
  leavesSrc,
  mode,
  peopleStageOneProgress,
  peopleStageOneSrc,
  peopleProgress,
  peopleSrc
}: FamilyTreeScrollStageProps) {
  const sceneStyle = {
    "--stage-base-progress": baseProgress.toFixed(4),
    "--stage-leaves-stage-one-progress": leavesStageOneProgress.toFixed(4),
    "--stage-leaves-progress": leavesProgress.toFixed(4),
    "--stage-people-stage-one-progress": peopleStageOneProgress.toFixed(4),
    "--stage-people-progress": peopleProgress.toFixed(4)
  } as CSSProperties;

  return (
    <div className={`${styles.stageShell} ${mode === "static" ? styles.stageStatic : styles.stageInteractive}`.trim()} style={sceneStyle}>
      <div className={styles.stageFrame} role="img" aria-label="Семейное дерево: сначала дерево, затем листья, затем люди">
        <div className={`${styles.layer} ${styles.baseLayer}`} aria-hidden="true">
          <img src={baseSrc} alt="" loading="eager" draggable={false} />
        </div>
        <div className={`${styles.layer} ${styles.leavesStageOneLayer}`} aria-hidden="true">
          <img src={leavesStageOneSrc} alt="" loading="eager" draggable={false} />
        </div>
        <div className={`${styles.layer} ${styles.leavesLayer}`} aria-hidden="true">
          <img src={leavesSrc} alt="" loading="eager" draggable={false} />
        </div>
        <div className={`${styles.layer} ${styles.peopleStageOneLayer}`} aria-hidden="true">
          <img src={peopleStageOneSrc} alt="" loading="eager" draggable={false} />
        </div>
        <div className={`${styles.layer} ${styles.peopleLayer}`} aria-hidden="true">
          <img src={peopleSrc} alt="" loading="eager" draggable={false} />
        </div>
      </div>
    </div>
  );
}
