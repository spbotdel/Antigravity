"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import styles from "./family-tree-landing-scene.module.css";

interface SceneStep {
  kicker: string;
  title: string;
  body: string;
  legend: string;
}

const SCENE_STEPS: SceneStep[] = [
  {
    kicker: "Этап 1",
    title: "Сначала проявляется каркас дерева.",
    body: "Основа сцены задает спокойный ритм: одно семейное поле для просмотра, редактирования и контроля доступа.",
    legend: "База и ветви"
  },
  {
    kicker: "Этап 2",
    title: "Потом на ветках появляется листва памяти.",
    body: "Фотографии, заметки и маленькие семейные детали собираются вокруг структуры, а не вытесняют ее.",
    legend: "Листва и архив"
  },
  {
    kicker: "Этап 3",
    title: "В финале на передний план выходят люди.",
    body: "Герой заканчивается там, где начинается продукт: семья остается главным объектом, а интерфейс только поддерживает ее.",
    legend: "Люди и роли"
  }
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPhaseProgress(progress: number, start: number, end: number) {
  return clamp((progress - start) / (end - start), 0, 1);
}

function getActiveStep(progress: number) {
  if (progress >= 0.7) {
    return 2;
  }

  if (progress >= 0.32) {
    return 1;
  }

  return 0;
}

export function FamilyTreeLandingScene() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof window === "undefined") {
      return;
    }

    let frameId = 0;

    const updateProgress = () => {
      frameId = 0;

      const rect = element.getBoundingClientRect();
      const travelDistance = Math.max(element.offsetHeight - window.innerHeight * 0.72, 1);
      const traveled = clamp(-rect.top, 0, travelDistance);
      const nextProgress = clamp(traveled / travelDistance, 0, 1);

      setProgress((current) => (Math.abs(current - nextProgress) > 0.002 ? nextProgress : current));
    };

    const requestUpdate = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = window.requestAnimationFrame(updateProgress);
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  const baseProgress = getPhaseProgress(progress, 0, 0.36);
  const leavesProgress = getPhaseProgress(progress, 0.24, 0.72);
  const peopleProgress = getPhaseProgress(progress, 0.58, 1);
  const activeStep = getActiveStep(progress);
  const sceneStyle = {
    "--scene-progress": progress.toFixed(4),
    "--base-progress": baseProgress.toFixed(4),
    "--leaves-progress": leavesProgress.toFixed(4),
    "--people-progress": peopleProgress.toFixed(4)
  } as CSSProperties;

  return (
    <section ref={sectionRef} className={styles.hero} style={sceneStyle}>
      <div className={styles.copyColumn}>
        <div className={styles.introBlock}>
          <p className="eyebrow">Landing Experiment</p>
          <h1 className={styles.title}>Соберите семейную историю в одном рабочем дереве.</h1>
          <p className={styles.lead}>
            Новый hero раскрывает дерево как живую сцену: сначала каркас, затем листва архива и только потом люди, ради которых весь контур и нужен.
          </p>
          <div className={`hero-actions ${styles.actions}`}>
            <Link href="/auth/register" className="primary-button">
              Начать с дерева
            </Link>
            <Link href="/auth/login" className="ghost-button">
              Войти
            </Link>
          </div>
          <ul className={styles.highlights}>
            <li className={styles.highlightItem}>Scroll-driven сцена остается только на landing и не трогает viewer, builder или архив.</li>
            <li className={styles.highlightItem}>Основа, листва и люди раскрываются как отдельные слои без новой общей motion-архитектуры.</li>
            <li className={styles.highlightItem}>Изображения и стили лежат рядом с экспериментом, чтобы его можно было развивать или удалить без побочных эффектов.</li>
          </ul>
        </div>

        <div className={styles.storyRail}>
          {SCENE_STEPS.map((step, index) => {
            const stateClassName =
              index === activeStep ? styles.stepCardActive : index < activeStep ? styles.stepCardComplete : "";

            return (
              <article
                key={step.title}
                className={`${styles.stepCard} ${stateClassName}`.trim()}
                aria-current={index === activeStep ? "step" : undefined}
              >
                <span className={styles.stepIndex}>0{index + 1}</span>
                <p className="card-kicker">{step.kicker}</p>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </article>
            );
          })}
        </div>
      </div>

      <div className={styles.sceneColumn}>
        <section className={`surface-card ${styles.sceneFrame}`}>
          <div className={styles.sceneHeader}>
            <div className={styles.sceneHeading}>
              <p className="card-kicker">Scroll Scene</p>
              <h2>{SCENE_STEPS[activeStep].title}</h2>
              <p>{SCENE_STEPS[activeStep].body}</p>
            </div>
            <div className={styles.progressBadge}>
              <span>Reveal</span>
              <strong>{Math.round(progress * 100)}%</strong>
            </div>
          </div>

          <div className={styles.sceneCanvas}>
            <div className={styles.canvasGlow} aria-hidden="true" />
            <div className={`${styles.layerBadge} ${styles.baseBadge}`} aria-hidden="true">
              Основа
            </div>
            <div className={`${styles.layerBadge} ${styles.leavesBadge}`} aria-hidden="true">
              Листва
            </div>
            <div className={`${styles.layerBadge} ${styles.peopleBadge}`} aria-hidden="true">
              Люди
            </div>
            <div className={`${styles.layer} ${styles.baseLayer}`} aria-hidden="true">
              <img src="/landing/family-tree-scene/base-tree.svg" alt="" loading="eager" />
            </div>
            <div className={`${styles.layer} ${styles.leavesLayer}`} aria-hidden="true">
              <img src="/landing/family-tree-scene/leaves-layer.svg" alt="" loading="eager" />
            </div>
            <div className={`${styles.layer} ${styles.peopleLayer}`} aria-hidden="true">
              <img src="/landing/family-tree-scene/people-layer.svg" alt="" loading="eager" />
            </div>

            <div className={styles.legend}>
              <div className={styles.progressTrack} aria-hidden="true">
                <span className={styles.progressFill} />
              </div>
              <div className={styles.legendRow}>
                {SCENE_STEPS.map((step, index) => {
                  const stateClassName =
                    index === activeStep ? styles.legendItemActive : index < activeStep ? styles.legendItemComplete : "";

                  return (
                    <div key={step.legend} className={`${styles.legendItem} ${stateClassName}`.trim()}>
                      <span>{step.kicker}</span>
                      <strong>{step.legend}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
