"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { buildDashboardModel } from "@/components/dashboard/dashboard-model";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import type { MembershipRecord, TreeRecord } from "@/lib/types";

const dashboardHeaderCopy = {
  owned: {
    title: "Ваше дерево",
    description: "Откройте конструктор для изменений или перейдите к просмотру без лишних шагов."
  },
  invited_only: {
    title: "Доступные деревья",
    description: "Сначала показываем деревья, к которым у вас уже есть доступ. Собственное дерево можно создать ниже, когда это действительно нужно."
  },
  empty: {
    title: "Создайте первое дерево",
    description: "После создания вы сразу попадете в конструктор и сможете продолжить работу из dashboard."
  }
} as const;

interface DashboardPageState {
  status: "loading" | "ready" | "error";
  items: Array<{
    membership: MembershipRecord;
    tree: TreeRecord;
  }>;
  error: string | null;
}

const initialState: DashboardPageState = {
  status: "loading",
  items: [],
  error: null
};
const DASHBOARD_REQUEST_TIMEOUT_MS = 20000;

function getDashboardErrorMessage(error: string | null) {
  if (!error) {
    return "Не удалось загрузить панель управления.";
  }

  if (error.includes("AbortError")) {
    return "Сервер слишком долго отвечает при загрузке панели управления.";
  }

  if (error.includes("fetch failed")) {
    return "Сервер не смог связаться с Supabase. Панель пока недоступна с этого окружения.";
  }

  if (error.includes("stack depth limit exceeded")) {
    return "Supabase вернул ошибку политики доступа. Список деревьев сейчас не может загрузиться.";
  }

  if (error.includes("legacy SUPABASE_SERVICE_ROLE_KEY")) {
    return error;
  }

  return error;
}

export function DashboardPageClient() {
  const router = useRouter();
  const [state, setState] = useState<DashboardPageState>(initialState);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error("AbortError"));
    }, DASHBOARD_REQUEST_TIMEOUT_MS);

    async function loadDashboard() {
      const response = await fetch("/api/dashboard", {
        credentials: "include",
        signal: controller.signal,
        cache: "no-store"
      });

      if (!active) {
        return;
      }

      if (response.status === 401) {
        startTransition(() => {
          router.replace("/auth/login");
        });
        return;
      }

      const payload = await response.json();

      if (!response.ok) {
        setState({
          status: "error",
          items: [],
          error: payload.error || "Не удалось загрузить панель управления."
        });
        return;
      }

      setState({
        status: "ready",
        items: (payload.items as DashboardPageState["items"]) ?? [],
        error: null
      });
    }

    void loadDashboard().catch((error) => {
      if (!active) {
        return;
      }

      setState({
        status: "error",
        items: [],
        error: error instanceof Error ? error.message : "Не удалось загрузить панель управления."
      });
    });

    return () => {
      active = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [retryKey, router]);

  const dashboard = buildDashboardModel(state.items);
  const header = dashboardHeaderCopy[dashboard.dashboardState];

  return (
    <main className="page-shell dashboard-page">
      <section className="section-header dashboard-header">
        <p className="eyebrow">Панель управления</p>
        <h1 className="dashboard-title">{header.title}</h1>
        <p className="muted-copy">
          {state.status === "loading" ? "Загружаю деревья и права доступа..." : header.description}
        </p>
      </section>

      {state.status === "error" ? (
        <section className="surface-card">
          <p className="card-kicker">Supabase</p>
          <h2>Панель пока недоступна</h2>
          <p className="muted-copy">{getDashboardErrorMessage(state.error)}</p>
          <div className="card-actions dashboard-card-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setState(initialState);
                setRetryKey((value) => value + 1);
              }}
            >
              Повторить
            </button>
          </div>
        </section>
      ) : null}

      {state.status === "ready" ? <DashboardOverview dashboard={dashboard} /> : null}
    </main>
  );
}
