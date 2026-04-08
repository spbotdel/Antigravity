"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { FamilyTreeScrollStage } from "@/components/landing/family-tree-scroll-stage";

import styles from "./family-tree-test3-page.module.css";

type LandingMode = "interactive" | "static";
type SunVariant = "none" | "original" | "no-blur" | "no-blend" | "double" | "single";

interface SceneScale {
  x: number;
  y: number;
}

interface LandingRenderState {
  mode: LandingMode;
  renderProgress: number;
  stickyTop: number;
  targetProgress: number;
}

interface FamilyTreeTest3PageProps {
  sunVariant: SunVariant;
  backgroundBaseSrc?: string;
}

const SCENE_BASE_WIDTH = 1440;
const SCENE_BASE_HEIGHT = 900;

const sunVariantClassNames: Record<SunVariant, string> = {
  none: styles.variantNone,
  original: styles.variantOriginal,
  "no-blur": styles.variantNoBlur,
  "no-blend": styles.variantNoBlend,
  double: styles.variantDouble,
  single: styles.variantSingle
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPhaseProgress(progress: number, start: number, end: number) {
  return clamp((progress - start) / (end - start), 0, 1);
}

function getSunLightProgress(
  leavesStageOneProgress: number,
  leavesProgress: number,
  peopleStageOneProgress: number,
  peopleProgress: number
) {
  return clamp(
    0.14 + leavesStageOneProgress * 0.18 + leavesProgress * 0.3 + peopleStageOneProgress * 0.14 + peopleProgress * 0.08,
    0.14,
    0.84
  );
}

function getSceneScale(): SceneScale {
  if (typeof window === "undefined") {
    return { x: 1, y: 1 };
  }

  return {
    x: window.innerWidth / SCENE_BASE_WIDTH,
    y: window.innerHeight / SCENE_BASE_HEIGHT
  };
}

export function FamilyTreeTest3Page({ sunVariant, backgroundBaseSrc }: FamilyTreeTest3PageProps) {
  const landingConfig = useRef({
    assets: {
      backgroundBase: "/landing/family-tree-scene/prepared-bg-base-scene-v2.png",
      base: "/landing/family-tree-scene/prepared-base-tree.png",
      cloudBanks: "/landing/family-tree-scene/elements/cloud-banks.png",
      sunGold: "/landing/family-tree-scene/elements-named/sun-gold.png",
      sunOutline: "/landing/family-tree-scene/elements-named/sun-outline-soft.png",
      leavesStageOne: "/landing/family-tree-scene/prepared-leaves-layer-stage-1.png",
      leaves: "/landing/family-tree-scene/prepared-leaves-layer-stage-2.png",
      peopleStageOne: "/landing/family-tree-scene/prepared-people-layer-stage-1.png",
      people: "/landing/family-tree-scene/prepared-people-layer-stage-2.png"
    },
    breakpoints: {
      interactive: 980
    },
    easingFactor: 0.2,
    initialMode: "static" as const,
    phases: {
      base: {
        end: 0.18,
        start: 0
      },
      leavesStageOne: {
        end: 0.38,
        start: 0.18
      },
      leaves: {
        end: 0.58,
        start: 0.38
      },
      peopleStageOne: {
        end: 0.76,
        start: 0.58
      },
      people: {
        end: 0.94,
        start: 0.76
      }
    },
    precision: {
      progress: 0.0015,
      stickyTop: 0.5
    },
    staticProgress: 1,
    stickyGap: 0,
    touchSpeed: 0.0024,
    wheelSpeed: 0.0011
  }).current;

  const initialRenderState: LandingRenderState = {
    mode: landingConfig.initialMode,
    renderProgress: landingConfig.staticProgress,
    stickyTop: landingConfig.stickyGap,
    targetProgress: landingConfig.staticProgress
  };

  const sectionRef = useRef<HTMLElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const renderStateRef = useRef<LandingRenderState>(initialRenderState);
  const [renderState, setRenderState] = useState<LandingRenderState>(initialRenderState);
  const [sceneScale, setSceneScale] = useState<SceneScale>({ x: 1, y: 1 });

  const commitRenderState = (nextState: LandingRenderState) => {
    const currentState = renderStateRef.current;

    if (
      currentState.mode === nextState.mode &&
      Math.abs(currentState.targetProgress - nextState.targetProgress) <= landingConfig.precision.progress &&
      Math.abs(currentState.renderProgress - nextState.renderProgress) <= landingConfig.precision.progress &&
      Math.abs(currentState.stickyTop - nextState.stickyTop) <= landingConfig.precision.stickyTop
    ) {
      return;
    }

    renderStateRef.current = nextState;
    setRenderState(nextState);
  };

  useLayoutEffect(() => {
    const syncSceneScale = () => {
      setSceneScale(getSceneScale());
    };

    syncSceneScale();
    window.addEventListener("resize", syncSceneScale);

    return () => {
      window.removeEventListener("resize", syncSceneScale);
    };
  }, []);

  useLayoutEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof window === "undefined") {
      return;
    }

    const reducedMotionQuery =
      typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const htmlElement = document.documentElement;
    const bodyElement = document.body;
    const previousHtmlOverflow = htmlElement.style.overflow;
    const previousBodyOverflow = bodyElement.style.overflow;
    const previousHtmlHeight = htmlElement.style.height;
    const previousBodyHeight = bodyElement.style.height;

    let animationFrameId = 0;
    let active = true;

    const getStickyTop = () => landingConfig.stickyGap;

    const getNextMode = () => {
      if (reducedMotionQuery?.matches) {
        return "static" as const;
      }
      if (window.innerWidth <= landingConfig.breakpoints.interactive) {
        return "static" as const;
      }
      return "interactive" as const;
    };

    const animateToTarget = () => {
      animationFrameId = 0;
      if (!active) return;
      const currentState = renderStateRef.current;
      if (currentState.mode === "static") return;
      const delta = currentState.targetProgress - currentState.renderProgress;
      if (Math.abs(delta) <= landingConfig.precision.progress) {
        commitRenderState({ ...currentState, renderProgress: currentState.targetProgress });
        return;
      }
      commitRenderState({
        ...currentState,
        renderProgress: clamp(currentState.renderProgress + delta * landingConfig.easingFactor, 0, 1)
      });
      animationFrameId = window.requestAnimationFrame(animateToTarget);
    };

    const scheduleAnimation = () => {
      if (animationFrameId !== 0 || renderStateRef.current.mode === "static") return;
      animationFrameId = window.requestAnimationFrame(animateToTarget);
    };

    const syncViewportState = () => {
      const stickyTop = getStickyTop();
      const nextMode = getNextMode();
      if (nextMode === "static") {
        commitRenderState({
          mode: "static",
          renderProgress: landingConfig.staticProgress,
          stickyTop,
          targetProgress: landingConfig.staticProgress
        });
        return;
      }
      const currentState = renderStateRef.current;
      const shouldResetIntoInteractive = currentState.mode === "static" || currentState.renderProgress >= 1;
      commitRenderState({
        mode: nextMode,
        renderProgress: shouldResetIntoInteractive ? 0 : currentState.renderProgress,
        stickyTop,
        targetProgress: shouldResetIntoInteractive ? 0 : currentState.targetProgress
      });
      scheduleAnimation();
    };

    const advanceProgress = (delta: number) => {
      const currentState = renderStateRef.current;
      if (currentState.mode !== "interactive") return;
      commitRenderState({
        ...currentState,
        targetProgress: clamp(currentState.targetProgress + delta, 0, 1)
      });
      scheduleAnimation();
    };

    const handleWheel = (event: WheelEvent) => {
      if (renderStateRef.current.mode !== "interactive") return;
      event.preventDefault();
      advanceProgress(event.deltaY * landingConfig.wheelSpeed);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (renderStateRef.current.mode !== "interactive") {
        touchStartYRef.current = null;
        return;
      }
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (renderStateRef.current.mode !== "interactive") return;
      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined || touchStartYRef.current === null) return;
      const deltaY = touchStartYRef.current - currentY;
      if (Math.abs(deltaY) < 2) return;
      event.preventDefault();
      touchStartYRef.current = currentY;
      advanceProgress(deltaY * landingConfig.touchSpeed);
    };

    const handleTouchEnd = () => {
      touchStartYRef.current = null;
    };

    const handleMotionPreferenceChange = () => {
      syncViewportState();
      scheduleAnimation();
    };

    syncViewportState();
    htmlElement.style.overflow = "hidden";
    bodyElement.style.overflow = "hidden";
    htmlElement.style.height = "100svh";
    bodyElement.style.height = "100svh";

    element.addEventListener("wheel", handleWheel, { passive: false });
    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("resize", syncViewportState);

    if (reducedMotionQuery) {
      const legacyReducedMotionQuery = reducedMotionQuery as MediaQueryList & {
        addListener?: (listener: () => void) => void;
        removeListener?: (listener: () => void) => void;
      };
      if (typeof reducedMotionQuery.addEventListener === "function") {
        reducedMotionQuery.addEventListener("change", handleMotionPreferenceChange);
      } else if (typeof legacyReducedMotionQuery.addListener === "function") {
        legacyReducedMotionQuery.addListener(handleMotionPreferenceChange);
      }
    }

    return () => {
      active = false;
      if (animationFrameId !== 0) window.cancelAnimationFrame(animationFrameId);
      htmlElement.style.overflow = previousHtmlOverflow;
      bodyElement.style.overflow = previousBodyOverflow;
      htmlElement.style.height = previousHtmlHeight;
      bodyElement.style.height = previousBodyHeight;
      element.removeEventListener("wheel", handleWheel);
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("resize", syncViewportState);
      if (reducedMotionQuery) {
        const legacyReducedMotionQuery = reducedMotionQuery as MediaQueryList & {
          addListener?: (listener: () => void) => void;
          removeListener?: (listener: () => void) => void;
        };
        if (typeof reducedMotionQuery.removeEventListener === "function") {
          reducedMotionQuery.removeEventListener("change", handleMotionPreferenceChange);
        } else if (typeof legacyReducedMotionQuery.removeListener === "function") {
          legacyReducedMotionQuery.removeListener(handleMotionPreferenceChange);
        }
      }
    };
  }, [landingConfig]);

  const baseProgress =
    renderState.mode === "static"
      ? landingConfig.staticProgress
      : getPhaseProgress(renderState.renderProgress, landingConfig.phases.base.start, landingConfig.phases.base.end);
  const leavesStageOneProgress =
    renderState.mode === "static"
      ? landingConfig.staticProgress
      : getPhaseProgress(renderState.renderProgress, landingConfig.phases.leavesStageOne.start, landingConfig.phases.leavesStageOne.end);
  const leavesProgress =
    renderState.mode === "static"
      ? landingConfig.staticProgress
      : getPhaseProgress(renderState.renderProgress, landingConfig.phases.leaves.start, landingConfig.phases.leaves.end);
  const peopleStageOneProgress =
    renderState.mode === "static"
      ? landingConfig.staticProgress
      : getPhaseProgress(renderState.renderProgress, landingConfig.phases.peopleStageOne.start, landingConfig.phases.peopleStageOne.end);
  const peopleProgress =
    renderState.mode === "static"
      ? landingConfig.staticProgress
      : getPhaseProgress(renderState.renderProgress, landingConfig.phases.people.start, landingConfig.phases.people.end);

  const sunLightProgress = getSunLightProgress(
    leavesStageOneProgress,
    leavesProgress,
    peopleStageOneProgress,
    peopleProgress
  );
  const sunTranslateX = -61 * sceneScale.x;
  const sunTranslateY = -43 * sceneScale.y;

  const viewportStyle = {
    "--landing-sticky-top": `${renderState.stickyTop}px`,
    "--test3-sun-light-progress": sunLightProgress.toFixed(4),
    "--test3-sun-gold-opacity": sunLightProgress.toFixed(4),
    "--test3-sun-halo-opacity": (0.08 + sunLightProgress * 0.22).toFixed(4),
    "--test3-sun-halo-scale": (0.98 + sunLightProgress * 0.14).toFixed(4)
  } as CSSProperties;

  return (
    <section
      ref={sectionRef}
      className={[styles.viewport, sunVariantClassNames[sunVariant]].filter(Boolean).join(" ")}
      style={viewportStyle}
    >
      <div className={styles.backgroundLayers} aria-hidden="true">
        <img
          className={styles.backgroundBase}
          src={backgroundBaseSrc ?? landingConfig.assets.backgroundBase}
          alt=""
          loading="eager"
          draggable={false}
        />

        <div className={styles.backgroundDecorations}>
          <div
            className={styles.sunItem}
            style={{
              transform: `translate(${sunTranslateX.toFixed(2)}px, ${sunTranslateY.toFixed(2)}px)`
            }}
          >
            <div className={styles.sunHalo} />
            <img className={styles.sunOutline} src={landingConfig.assets.sunOutline} alt="" loading="eager" draggable={false} />
            <img className={styles.sunGold} src={landingConfig.assets.sunGold} alt="" loading="eager" draggable={false} />
          </div>

          <img
            className={`${styles.decoration} ${styles.cloudBanks}`.trim()}
            src={landingConfig.assets.cloudBanks}
            alt=""
            loading="eager"
            draggable={false}
          />
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.copyColumn} aria-hidden="true" />
        <div className={styles.sceneColumn}>
          <FamilyTreeScrollStage
            baseProgress={baseProgress}
            baseSrc={landingConfig.assets.base}
            leavesStageOneProgress={leavesStageOneProgress}
            leavesStageOneSrc={landingConfig.assets.leavesStageOne}
            leavesProgress={leavesProgress}
            leavesSrc={landingConfig.assets.leaves}
            mode={renderState.mode}
            peopleStageOneProgress={peopleStageOneProgress}
            peopleStageOneSrc={landingConfig.assets.peopleStageOne}
            peopleProgress={peopleProgress}
            peopleSrc={landingConfig.assets.people}
          />
        </div>
      </div>
    </section>
  );
}
