"use client";

import Link from "next/link";
import { Golos_Text, Playfair_Display } from "next/font/google";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { FamilyTreeScrollStage } from "@/components/landing/family-tree-scroll-stage";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

import styles from "./family-tree-test4-page.module.css";

const playfairDisplay = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  display: "swap"
});

const golosText = Golos_Text({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap"
});

type LandingMode = "interactive" | "static";
type InteractionKind = "hint" | "touch" | "wheel";
type AuthStatus = "unknown" | "guest" | "signed_in";

interface LandingRenderState {
  mode: LandingMode;
  renderProgress: number;
  stickyTop: number;
  targetProgress: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPhaseProgress(progress: number, start: number, end: number) {
  return clamp((progress - start) / (end - start), 0, 1);
}

export function FamilyTreeTest4Page() {
  const landingConfig = useRef({
    assets: {
      backgroundBase: "/landing/family-tree-scene/reference-cloud/prepared-bg-base-scene-v2.png",
      base: "/landing/family-tree-scene/reference-cloud/prepared-base-tree.png",
      cloudBanks: "/landing/family-tree-scene/reference-cloud/cloud-banks.png",
      leavesStageOne: "/landing/family-tree-scene/reference-cloud/prepared-leaves-layer-stage-1.png",
      leaves: "/landing/family-tree-scene/reference-cloud/prepared-leaves-layer-stage-2.png",
      peopleStageOne: "/landing/family-tree-scene/reference-cloud/prepared-people-layer-stage-1.png",
      people: "/landing/family-tree-scene/reference-cloud/prepared-people-layer-stage-2.png"
    },
    autoNudge: {
      delayMs: 900,
      holdMs: 260,
      peakProgress: 0.028
    },
    easingFactor: 0.2,
    hapticDurationMs: 10,
    initialMode: "interactive" as LandingMode,
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

  const initialProgress = landingConfig.initialMode === "static" ? landingConfig.staticProgress : 0;

  const initialRenderState: LandingRenderState = {
    mode: landingConfig.initialMode,
    renderProgress: initialProgress,
    stickyTop: landingConfig.stickyGap,
    targetProgress: initialProgress
  };

  const sectionRef = useRef<HTMLElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const renderStateRef = useRef<LandingRenderState>(initialRenderState);
  const jumpToProgressRef = useRef<((nextTarget: number, source: InteractionKind) => void) | null>(null);
  const hasAutoNudgedRef = useRef(false);
  const hasHapticFiredRef = useRef(false);
  const hasUnlockedPrimaryCtaRef = useRef(false);
  const hasUserInteractedRef = useRef(false);
  const isIntroReadyRef = useRef(false);
  const [renderState, setRenderState] = useState<LandingRenderState>(initialRenderState);
  const [hasUnlockedPrimaryCta, setHasUnlockedPrimaryCta] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isIntroReady, setIsIntroReady] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("unknown");
  const [isLoginOpen, setIsLoginOpen] = useState(false);

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
    let introReadyFrameId = 0;
    let autoNudgeDelayId = 0;
    let autoNudgeReturnId = 0;
    let active = true;

    const clearTimeoutIfNeeded = (timeoutId: number) => {
      if (timeoutId !== 0) {
        window.clearTimeout(timeoutId);
      }

      return 0;
    };

    const cancelAutoNudge = () => {
      autoNudgeDelayId = clearTimeoutIfNeeded(autoNudgeDelayId);
      autoNudgeReturnId = clearTimeoutIfNeeded(autoNudgeReturnId);
    };

    const markIntroReady = () => {
      if (!active || isIntroReadyRef.current) {
        return;
      }

      isIntroReadyRef.current = true;
      setIsIntroReady(true);
    };

    const ensureIntroReady = () => {
      if (isIntroReadyRef.current || introReadyFrameId !== 0) {
        return;
      }

      introReadyFrameId = window.requestAnimationFrame(() => {
        introReadyFrameId = 0;
        markIntroReady();
      });
    };

    const getStickyTop = () => landingConfig.stickyGap;

    const getNextMode = () => {
      if (reducedMotionQuery?.matches) {
        return "static" as const;
      }

      return "interactive" as const;
    };

    const animateToTarget = () => {
      animationFrameId = 0;

      if (!active) {
        return;
      }

      const currentState = renderStateRef.current;
      if (currentState.mode === "static") {
        return;
      }

      const delta = currentState.targetProgress - currentState.renderProgress;
      if (Math.abs(delta) <= landingConfig.precision.progress) {
        commitRenderState({
          ...currentState,
          renderProgress: currentState.targetProgress
        });
        return;
      }

      commitRenderState({
        ...currentState,
        renderProgress: clamp(currentState.renderProgress + delta * landingConfig.easingFactor, 0, 1)
      });

      animationFrameId = window.requestAnimationFrame(animateToTarget);
    };

    const scheduleAnimation = () => {
      if (animationFrameId !== 0 || renderStateRef.current.mode === "static") {
        return;
      }

      animationFrameId = window.requestAnimationFrame(animateToTarget);
    };

    const setSceneTarget = (nextTarget: number) => {
      const currentState = renderStateRef.current;
      if (currentState.mode !== "interactive") {
        return;
      }

      const clampedTarget = clamp(nextTarget, 0, 1);
      if (Math.abs(clampedTarget - currentState.targetProgress) <= landingConfig.precision.progress) {
        return;
      }

      commitRenderState({
        ...currentState,
        targetProgress: clampedTarget
      });
      scheduleAnimation();
    };

    const markUserInteraction = (kind: InteractionKind) => {
      if (hasUserInteractedRef.current) {
        return;
      }

      hasUserInteractedRef.current = true;
      setHasUserInteracted(true);
      cancelAutoNudge();

      if (
        kind === "touch" &&
        !hasHapticFiredRef.current &&
        !reducedMotionQuery?.matches &&
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
      ) {
        navigator.vibrate(landingConfig.hapticDurationMs);
        hasHapticFiredRef.current = true;
      }
    };

    const advanceProgress = (delta: number, source: InteractionKind) => {
      const currentState = renderStateRef.current;
      if (currentState.mode !== "interactive") {
        return;
      }

      const nextTarget = clamp(currentState.targetProgress + delta, 0, 1);
      if (Math.abs(nextTarget - currentState.targetProgress) <= landingConfig.precision.progress) {
        return;
      }

      markUserInteraction(source);
      commitRenderState({
        ...currentState,
        targetProgress: nextTarget
      });
      scheduleAnimation();
    };

    const jumpToProgress = (nextTarget: number, source: InteractionKind) => {
      const currentState = renderStateRef.current;
      if (currentState.mode !== "interactive") {
        return;
      }

      const clampedTarget = clamp(nextTarget, 0, 1);
      if (Math.abs(clampedTarget - currentState.targetProgress) <= landingConfig.precision.progress) {
        return;
      }

      markUserInteraction(source);
      commitRenderState({
        ...currentState,
        targetProgress: clampedTarget
      });
      scheduleAnimation();
    };

    jumpToProgressRef.current = jumpToProgress;

    const scheduleAutoNudge = () => {
      if (
        autoNudgeDelayId !== 0 ||
        hasAutoNudgedRef.current ||
        hasUserInteractedRef.current ||
        reducedMotionQuery?.matches ||
        renderStateRef.current.mode !== "interactive"
      ) {
        return;
      }

      // Keep the cue tiny so the scene feels alive without faking a visible page scroll.
      autoNudgeDelayId = window.setTimeout(() => {
        autoNudgeDelayId = 0;

        if (
          !active ||
          hasAutoNudgedRef.current ||
          hasUserInteractedRef.current ||
          reducedMotionQuery?.matches ||
          renderStateRef.current.mode !== "interactive"
        ) {
          return;
        }

        hasAutoNudgedRef.current = true;
        setSceneTarget(landingConfig.autoNudge.peakProgress);

        autoNudgeReturnId = window.setTimeout(() => {
          autoNudgeReturnId = 0;

          if (!active || hasUserInteractedRef.current || renderStateRef.current.mode !== "interactive") {
            return;
          }

          setSceneTarget(0);
        }, landingConfig.autoNudge.holdMs);
      }, landingConfig.autoNudge.delayMs);
    };

    const syncViewportState = () => {
      const stickyTop = getStickyTop();
      const nextMode = getNextMode();

      if (nextMode === "static") {
        cancelAutoNudge();
        commitRenderState({
          mode: "static",
          renderProgress: landingConfig.staticProgress,
          stickyTop,
          targetProgress: landingConfig.staticProgress
        });
        ensureIntroReady();
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
      ensureIntroReady();
      scheduleAnimation();
      scheduleAutoNudge();
    };

    const handleWheel = (event: WheelEvent) => {
      if (renderStateRef.current.mode !== "interactive") {
        return;
      }

      const delta = event.deltaY * landingConfig.wheelSpeed;
      if (Math.abs(delta) <= landingConfig.precision.progress) {
        return;
      }

      event.preventDefault();
      advanceProgress(delta, "wheel");
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (renderStateRef.current.mode !== "interactive") {
        touchStartYRef.current = null;
        return;
      }

      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (renderStateRef.current.mode !== "interactive") {
        return;
      }

      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined || touchStartYRef.current === null) {
        return;
      }

      const deltaY = touchStartYRef.current - currentY;
      const progressDelta = deltaY * landingConfig.touchSpeed;
      if (Math.abs(progressDelta) <= landingConfig.precision.progress) {
        return;
      }

      event.preventDefault();
      touchStartYRef.current = currentY;
      advanceProgress(progressDelta, "touch");
    };

    const handleTouchEnd = () => {
      touchStartYRef.current = null;
    };

    const handleMotionPreferenceChange = () => {
      if (reducedMotionQuery?.matches) {
        cancelAutoNudge();
      }

      syncViewportState();
      scheduleAnimation();
      scheduleAutoNudge();
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
      jumpToProgressRef.current = null;
      cancelAutoNudge();

      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
      }

      if (introReadyFrameId !== 0) {
        window.cancelAnimationFrame(introReadyFrameId);
      }

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
  const leavesProgress =
    renderState.mode === "static"
      ? landingConfig.staticProgress
      : getPhaseProgress(renderState.renderProgress, landingConfig.phases.leaves.start, landingConfig.phases.leaves.end);
  const leavesStageOneProgress =
    renderState.mode === "static"
      ? landingConfig.staticProgress
      : getPhaseProgress(renderState.renderProgress, landingConfig.phases.leavesStageOne.start, landingConfig.phases.leavesStageOne.end);
  const peopleProgress =
    renderState.mode === "static"
      ? landingConfig.staticProgress
      : getPhaseProgress(renderState.renderProgress, landingConfig.phases.people.start, landingConfig.phases.people.end);
  const peopleStageOneProgress =
    renderState.mode === "static"
      ? landingConfig.staticProgress
      : getPhaseProgress(renderState.renderProgress, landingConfig.phases.peopleStageOne.start, landingConfig.phases.peopleStageOne.end);

  const isReducedMotion = renderState.mode === "static";
  const sceneProgress = isReducedMotion ? landingConfig.staticProgress : renderState.renderProgress;
  const uiProgress = isReducedMotion
    ? landingConfig.staticProgress
    : Math.max(renderState.renderProgress, renderState.targetProgress);
  const showHeroTitle = isIntroReady && (isReducedMotion || hasUserInteracted);
  const showMidSceneText = isIntroReady && (isReducedMotion || uiProgress >= landingConfig.phases.peopleStageOne.start);
  const showScrollHint = isIntroReady && renderState.mode === "interactive" && !hasUnlockedPrimaryCta;
  const showPrimaryCta = isIntroReady && (isReducedMotion || hasUnlockedPrimaryCta);

  useEffect(() => {
    if (hasUnlockedPrimaryCtaRef.current) {
      return;
    }

    if (!hasUserInteracted) {
      return;
    }

    if (uiProgress >= landingConfig.phases.people.end - landingConfig.precision.progress) {
      hasUnlockedPrimaryCtaRef.current = true;
      setHasUnlockedPrimaryCta(true);
    }
  }, [hasUserInteracted, landingConfig.phases.people.end, landingConfig.precision.progress, uiProgress]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let active = true;

    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) {
          setAuthStatus(data.user ? "signed_in" : "guest");
        }
      })
      .catch(() => {
        if (active) {
          setAuthStatus("guest");
        }
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setAuthStatus(session?.user ? "signed_in" : "guest");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isLoginOpen || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLoginOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLoginOpen]);

  const handleHintClick = () => {
    const hintStepTargets = [
      landingConfig.phases.leavesStageOne.end,
      landingConfig.phases.leaves.end,
      landingConfig.phases.peopleStageOne.end,
      landingConfig.phases.people.end
    ];
    const currentProgress = Math.max(renderState.renderProgress, renderState.targetProgress);
    const nextTarget =
      hintStepTargets.find((target) => currentProgress < target - landingConfig.precision.progress) ??
      landingConfig.phases.people.end;

    jumpToProgressRef.current?.(nextTarget, "hint");
  };

  const handlePrimaryCtaClick = () => {
    if (authStatus === "signed_in") {
      window.location.assign("/dashboard");
      return;
    }
    setIsLoginOpen(true);
  };

  const handleLoginSuccess = () => {
    setAuthStatus("signed_in");
    setIsLoginOpen(false);
  };

  const viewportStyle = {
    "--landing-sticky-top": `${renderState.stickyTop}px`
  } as CSSProperties;

  return (
    <section ref={sectionRef} className={styles.viewport} style={viewportStyle}>
      <div className={styles.backgroundLayers} aria-hidden="true">
        <img className={styles.backgroundBase} src={landingConfig.assets.backgroundBase} alt="" loading="eager" draggable={false} />
        <div className={styles.backgroundDecorations}>
          <img className={`${styles.decoration} ${styles.cloudBanks}`.trim()} src={landingConfig.assets.cloudBanks} alt="" loading="eager" draggable={false} />
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.copyColumn}>
          <div
            className={[
              styles.storyPanel,
              isReducedMotion ? styles.storyPanelReducedMotion : ""
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className={styles.storyCopy}>
              <h1
                className={[
                  styles.storyTitle,
                  playfairDisplay.className,
                  showHeroTitle ? styles.storyTitleVisible : "",
                  isReducedMotion ? styles.storyElementReducedMotion : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                Семейное дерево Русяйкиных
              </h1>
              <p
                className={[
                  styles.storyLead,
                  golosText.className,
                  showMidSceneText ? styles.storyLeadVisible : "",
                  isReducedMotion ? styles.storyElementReducedMotion : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                История <span className={styles.storyLeadEmphasis}>семьи</span>, собранная в одном месте
              </p>

              <div className={styles.storyActionSlot}>
                {showPrimaryCta ? (
                  <button
                    type="button"
                    className={[styles.storyCtaButton, styles.storyCtaButtonVisible, golosText.className].join(" ")}
                    onClick={handlePrimaryCtaClick}
                  >
                    <span className={styles.storyCtaTitle}>Открыть дерево</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

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

        <div
          className={[
            styles.scrollHint,
            showScrollHint ? styles.scrollHintVisible : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <button type="button" className={styles.scrollHintButton} onClick={handleHintClick} aria-label="Продвинуть сцену дальше">
            <span className={styles.scrollHintInner}>
              <span className={styles.scrollHintArrow} aria-hidden="true">↓</span>
            </span>
          </button>
        </div>
      </div>

      {isLoginOpen ? (
        <div className={styles.authOverlay} onClick={() => setIsLoginOpen(false)} role="presentation">
          <div
            className={styles.authDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="test4-login-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.authDialogHeader}>
              <div className={styles.authDialogCopy}>
                <p className={styles.authDialogEyebrow}>Вход</p>
                <h2 id="test4-login-title" className={[styles.authDialogTitle, playfairDisplay.className].join(" ")}>
                  Войти в семейное дерево
                </h2>
              </div>
              <button
                type="button"
                className={styles.authDialogClose}
                aria-label="Закрыть окно входа"
                onClick={() => setIsLoginOpen(false)}
              >
                ×
              </button>
            </div>

            <LoginForm className={styles.authPopupForm} nextPath="/dashboard" onSuccess={handleLoginSuccess} />

            <p className={[styles.authDialogFooter, golosText.className].join(" ")}>
              Еще нет аккаунта?{" "}
              <Link href="/auth/register" className={styles.authDialogLink} onClick={() => setIsLoginOpen(false)}>
                Создать новый
              </Link>
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
