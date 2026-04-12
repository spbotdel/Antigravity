"use client";

import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

const DEFAULT_TREE_UPLOAD_PANEL_BOTTOM_OFFSET = 96;
const TREE_UPLOAD_PANEL_TERMINAL_HIDE_DELAY_MS = 1500;
const TREE_UPLOAD_PANEL_CLOSE_ANIMATION_MS = 180;
const TREE_UPLOAD_PANEL_AUTO_COLLAPSE_DELAY_MS = 1600;

export type TreeUploadJobStatus = "queued" | "uploading" | "processing" | "completed" | "failed";

export interface TreeUploadJob {
  id: string;
  scope: string;
  fileName: string;
  status: TreeUploadJobStatus;
  uploadedBytes: number;
  totalBytes: number;
  progressPercent: number;
  message: string | null;
  createdAt: number;
  updatedAt: number;
}

type TreeUploadJobInput = Omit<TreeUploadJob, "createdAt" | "updatedAt"> & {
  createdAt?: number;
  updatedAt?: number;
};

interface TreeUploadPanelContextValue {
  upsertJob: (job: TreeUploadJobInput) => void;
  completeJob: (jobId: string, updates?: Partial<TreeUploadJobInput>) => void;
  failJob: (jobId: string, message?: string | null, updates?: Partial<TreeUploadJobInput>) => void;
  setBottomInset: (bottomInset: number) => void;
  clearBottomInset: () => void;
}

const noop = () => undefined;

const TreeUploadPanelContext = createContext<TreeUploadPanelContextValue>({
  upsertJob: noop,
  completeJob: noop,
  failJob: noop,
  setBottomInset: noop,
  clearBottomInset: noop,
});

function isActiveTreeUploadJob(job: Pick<TreeUploadJob, "status">) {
  return job.status === "queued" || job.status === "uploading" || job.status === "processing";
}

function isTerminalTreeUploadJob(job: Pick<TreeUploadJob, "status">) {
  return job.status === "completed" || job.status === "failed";
}

function formatUploadBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 Б";
  }

  if (value >= 1024 * 1024 * 1024) {
    const scaledValue = value / (1024 * 1024 * 1024);
    return `${Number.isInteger(scaledValue) ? scaledValue : scaledValue.toFixed(1)} ГБ`;
  }

  if (value >= 1024 * 1024) {
    const scaledValue = value / (1024 * 1024);
    return `${Number.isInteger(scaledValue) ? scaledValue : scaledValue.toFixed(1)} МБ`;
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)} КБ`;
  }

  return `${Math.round(value)} Б`;
}

function formatUploadJobStatus(status: TreeUploadJobStatus) {
  if (status === "queued") {
    return "В очереди";
  }

  if (status === "uploading") {
    return "Загрузка";
  }

  if (status === "processing") {
    return "Обработка";
  }

  if (status === "completed") {
    return "Готово";
  }

  return "Ошибка";
}

function countWithNoun(count: number, one: string, few: string, many: string) {
  const normalized = Math.abs(count) % 100;
  const lastDigit = normalized % 10;

  if (normalized > 10 && normalized < 20) {
    return `${count} ${many}`;
  }

  if (lastDigit === 1) {
    return `${count} ${one}`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} ${few}`;
  }

  return `${count} ${many}`;
}

function calculateAggregateUploadProgress(jobs: TreeUploadJob[]) {
  const totals = jobs.reduce(
    (accumulator, job) => {
      const totalBytes = Math.max(job.totalBytes, job.uploadedBytes, 0);
      accumulator.totalBytes += totalBytes;
      accumulator.uploadedBytes += Math.min(job.uploadedBytes, totalBytes || job.uploadedBytes);
      return accumulator;
    },
    { uploadedBytes: 0, totalBytes: 0 }
  );

  return {
    uploadedBytes: totals.uploadedBytes,
    totalBytes: totals.totalBytes,
    percent: totals.totalBytes > 0 ? Math.min(100, Math.round((totals.uploadedBytes / totals.totalBytes) * 100)) : 0,
  };
}

function buildUploadPanelSummary(jobs: TreeUploadJob[]) {
  const activeCount = jobs.filter(isActiveTreeUploadJob).length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const completedCount = jobs.filter((job) => job.status === "completed").length;

  if (activeCount) {
    return {
      title: "Загрузка файлов",
      subtitle:
        completedCount > 0
          ? `${countWithNoun(activeCount, "файл", "файла", "файлов")} в работе, ${countWithNoun(completedCount, "файл", "файла", "файлов")} готово.`
          : `${countWithNoun(activeCount, "файл", "файла", "файлов")} в работе.`,
    };
  }

  if (failedCount) {
    return {
      title: "Ошибка загрузки",
      subtitle: `${countWithNoun(failedCount, "файл", "файла", "файлов")} не удалось обработать.`,
    };
  }

  return {
    title: "Загрузка завершена",
    subtitle: `${countWithNoun(completedCount, "файл", "файла", "файлов")} обработано.`,
  };
}

function buildCollapsedUploadPanelSummary(jobs: TreeUploadJob[]) {
  const activeJobs = jobs.filter(isActiveTreeUploadJob);
  const aggregateProgress = calculateAggregateUploadProgress(activeJobs);
  const firstActiveJob = activeJobs[0] || null;

  if (!firstActiveJob) {
    return {
      title: "Загрузка файлов",
      subtitle: "",
      progressPercent: 0,
    };
  }

  if (activeJobs.length === 1) {
    const detail =
      aggregateProgress.totalBytes > 0
        ? `${formatUploadBytes(aggregateProgress.uploadedBytes)} из ${formatUploadBytes(aggregateProgress.totalBytes)}`
        : firstActiveJob.message || formatUploadJobStatus(firstActiveJob.status);

    return {
      title: firstActiveJob.fileName,
      subtitle: detail,
      progressPercent: aggregateProgress.percent,
    };
  }

  return {
    title: `${countWithNoun(activeJobs.length, "файл", "файла", "файлов")} в работе`,
    subtitle:
      aggregateProgress.totalBytes > 0
        ? `${formatUploadBytes(aggregateProgress.uploadedBytes)} из ${formatUploadBytes(aggregateProgress.totalBytes)}`
        : `${aggregateProgress.percent}%`,
    progressPercent: aggregateProgress.percent,
  };
}

function TreeUploadPanel(props: {
  jobs: TreeUploadJob[];
  showRows: boolean;
  bottomInset: number;
  isClosing: boolean;
  isCollapsed: boolean;
  hasActiveJobs: boolean;
  onExpand: () => void;
}) {
  if (!props.jobs.length) {
    return null;
  }

  const summary = buildUploadPanelSummary(props.jobs);
  const collapsedSummary = buildCollapsedUploadPanelSummary(props.jobs);
  const isInteractive = props.isCollapsed && props.hasActiveJobs;

  return (
    <div
      className="tree-upload-panel-shell"
      style={{ "--tree-upload-panel-bottom": `${props.bottomInset}px` } as CSSProperties}
      data-closing={props.isClosing ? "true" : "false"}
      data-collapsed={props.isCollapsed ? "true" : "false"}
      aria-live="polite"
    >
      <section
        className={`tree-upload-panel${props.isCollapsed ? " tree-upload-panel-collapsed" : ""}`}
        role="status"
        aria-label={summary.title}
        aria-expanded={isInteractive ? "false" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={isInteractive ? props.onExpand : undefined}
        onKeyDown={
          isInteractive
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  props.onExpand();
                }
              }
            : undefined
        }
      >
        <div className="tree-upload-panel-header">
          <div className="tree-upload-panel-copy">
            <strong>{summary.title}</strong>
            <span>{summary.subtitle}</span>
          </div>
        </div>

        {props.isCollapsed && props.hasActiveJobs ? (
          <div className="tree-upload-panel-collapsed-summary">
            <div className="tree-upload-panel-collapsed-copy">
              <strong title={collapsedSummary.title}>{collapsedSummary.title}</strong>
              <span>{collapsedSummary.subtitle}</span>
            </div>
            <div className="tree-upload-job-progress tree-upload-panel-collapsed-progress" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, Math.round(collapsedSummary.progressPercent)))}%` }} />
            </div>
          </div>
        ) : null}

        {props.showRows ? (
          <div className="tree-upload-panel-list" role="list" aria-label="Список загрузок">
            {props.jobs.map((job) => {
              const detail = job.totalBytes > 0 ? `${formatUploadBytes(job.uploadedBytes)} из ${formatUploadBytes(job.totalBytes)}` : null;

              return (
                <article key={job.id} className={`tree-upload-job tree-upload-job-${job.status}`} data-status={job.status} role="listitem">
                  <div className="tree-upload-job-top">
                    <strong title={job.fileName}>{job.fileName}</strong>
                    <span className="tree-upload-job-status">{formatUploadJobStatus(job.status)}</span>
                  </div>
                  <div className="tree-upload-job-meta">
                    <span>{job.message || formatUploadJobStatus(job.status)}</span>
                    <span>{job.status === "failed" ? "Требуется действие" : detail || `${Math.round(job.progressPercent)}%`}</span>
                  </div>
                  <div className="tree-upload-job-progress" aria-hidden="true">
                    <span style={{ width: `${Math.max(0, Math.min(100, Math.round(job.progressPercent)))}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function TreeUploadPanelProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<TreeUploadJob[]>([]);
  const [bottomInsetOverride, setBottomInsetOverride] = useState<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const terminalHideTimeoutRef = useRef<number | null>(null);
  const closeAnimationTimeoutRef = useRef<number | null>(null);
  const autoCollapseTimeoutRef = useRef<number | null>(null);
  const activeSessionRef = useRef(false);

  const clearTerminalTimers = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (terminalHideTimeoutRef.current !== null) {
      window.clearTimeout(terminalHideTimeoutRef.current);
      terminalHideTimeoutRef.current = null;
    }

    if (closeAnimationTimeoutRef.current !== null) {
      window.clearTimeout(closeAnimationTimeoutRef.current);
      closeAnimationTimeoutRef.current = null;
    }
  }, []);

  const clearAutoCollapseTimer = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (autoCollapseTimeoutRef.current !== null) {
      window.clearTimeout(autoCollapseTimeoutRef.current);
      autoCollapseTimeoutRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    clearTerminalTimers();
    clearAutoCollapseTimer();
  }, [clearAutoCollapseTimer, clearTerminalTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    setPortalRoot(document.body);
  }, []);

  const upsertJob = useCallback((job: TreeUploadJobInput) => {
    setJobs((current) => {
      const nextCurrent =
        isActiveTreeUploadJob(job)
          ? current.filter(isActiveTreeUploadJob)
          : current;
      const existing = nextCurrent.find((item) => item.id === job.id) || null;
      const nextJob: TreeUploadJob = {
        id: job.id,
        scope: job.scope,
        fileName: job.fileName,
        status: job.status,
        uploadedBytes: job.uploadedBytes,
        totalBytes: job.totalBytes,
        progressPercent: job.progressPercent,
        message: job.message ?? null,
        createdAt: existing?.createdAt ?? job.createdAt ?? Date.now(),
        updatedAt: job.updatedAt ?? Date.now(),
      };

      if (!existing) {
        return [...nextCurrent, nextJob];
      }

      return nextCurrent.map((item) => (item.id === job.id ? { ...item, ...nextJob, createdAt: item.createdAt } : item));
    });
  }, []);

  const completeJob = useCallback((jobId: string, updates?: Partial<TreeUploadJobInput>) => {
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...job,
              ...updates,
              status: "completed",
              uploadedBytes: updates?.uploadedBytes ?? updates?.totalBytes ?? job.totalBytes ?? job.uploadedBytes,
              totalBytes: updates?.totalBytes ?? job.totalBytes,
              progressPercent: 100,
              message: updates?.message ?? job.message ?? "Готово",
              updatedAt: Date.now(),
            }
          : job
      )
    );
  }, []);

  const failJob = useCallback((jobId: string, message?: string | null, updates?: Partial<TreeUploadJobInput>) => {
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...job,
              ...updates,
              status: "failed",
              message: message ?? updates?.message ?? job.message ?? "Не удалось загрузить файл.",
              updatedAt: Date.now(),
            }
          : job
      )
    );
  }, []);

  const setBottomInset = useCallback((bottomInset: number) => {
    setBottomInsetOverride(Math.max(DEFAULT_TREE_UPLOAD_PANEL_BOTTOM_OFFSET, Math.round(bottomInset)));
  }, []);

  const clearBottomInset = useCallback(() => {
    setBottomInsetOverride(null);
  }, []);

  useEffect(() => {
    const hasActiveJobs = jobs.some(isActiveTreeUploadJob);
    const hasTerminalJobs = jobs.some(isTerminalTreeUploadJob);

    clearTerminalTimers();

    if (hasActiveJobs) {
      if (!activeSessionRef.current && typeof window !== "undefined") {
        activeSessionRef.current = true;
        setIsClosing(false);
        setIsCollapsed(false);
        clearAutoCollapseTimer();
        autoCollapseTimeoutRef.current = window.setTimeout(() => {
          setIsCollapsed(true);
          autoCollapseTimeoutRef.current = null;
        }, TREE_UPLOAD_PANEL_AUTO_COLLAPSE_DELAY_MS);
      }
      return;
    }

    activeSessionRef.current = false;
    clearAutoCollapseTimer();

    if (!hasTerminalJobs) {
      setIsClosing(false);
      setIsCollapsed(false);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    terminalHideTimeoutRef.current = window.setTimeout(() => {
      setIsClosing(true);
      closeAnimationTimeoutRef.current = window.setTimeout(() => {
        setJobs((current) => current.filter(isActiveTreeUploadJob));
        setIsClosing(false);
        setIsCollapsed(false);
      }, TREE_UPLOAD_PANEL_CLOSE_ANIMATION_MS);
    }, TREE_UPLOAD_PANEL_TERMINAL_HIDE_DELAY_MS);
  }, [clearAutoCollapseTimer, clearTerminalTimers, jobs]);

  const contextValue = useMemo<TreeUploadPanelContextValue>(
    () => ({
      upsertJob,
      completeJob,
      failJob,
      setBottomInset,
      clearBottomInset,
    }),
    [clearBottomInset, completeJob, failJob, setBottomInset, upsertJob]
  );

  const resolvedBottomInset = bottomInsetOverride ?? DEFAULT_TREE_UPLOAD_PANEL_BOTTOM_OFFSET;
  const visibleJobs = jobs.filter(isActiveTreeUploadJob);
  const terminalJobs = visibleJobs.length
    ? []
    : jobs.filter(isTerminalTreeUploadJob);
  const panelJobs = visibleJobs.length ? visibleJobs : terminalJobs;
  const showRows = visibleJobs.length > 0 && !isCollapsed;

  return (
    <TreeUploadPanelContext.Provider value={contextValue}>
      {children}
      {portalRoot
        ? createPortal(
            <TreeUploadPanel
              jobs={panelJobs}
              showRows={showRows}
              bottomInset={resolvedBottomInset}
              isClosing={isClosing}
              isCollapsed={isCollapsed}
              hasActiveJobs={visibleJobs.length > 0}
              onExpand={() => setIsCollapsed(false)}
            />,
            portalRoot
          )
        : null}
    </TreeUploadPanelContext.Provider>
  );
}

export function useTreeUploadPanel() {
  return useContext(TreeUploadPanelContext);
}
