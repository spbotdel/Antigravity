"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { buildDashboardModel } from "@/components/dashboard/dashboard-model";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import type { MembershipRecord, TreeRecord } from "@/lib/types";

const dashboardHeaderCopy = {
  owned: {
    title: "Ваше дерево",
    description: "Откройте конструктор для изменений или просмотр для спокойной проверки структуры."
  },
  invited_only: {
    title: "Доступные деревья",
    description: "Сначала показываем деревья, к которым у вас уже есть доступ. Свое можно создать ниже, если оно действительно понадобится."
  },
  empty: {
    title: "Создайте первое дерево",
    description: "После создания вы сразу попадете в конструктор."
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
const DASHBOARD_TIMEOUT_ERROR = "__dashboard_timeout__";

function getDashboardErrorMessage(error: string | null) {
  if (!error) {
    return "Не удалось загрузить панель управления.";
  }

  if (error === DASHBOARD_TIMEOUT_ERROR) {
    return "Сервер слишком долго отвечает при загрузке панели управления.";
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
    let timedOut = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, DASHBOARD_REQUEST_TIMEOUT_MS);

    async function loadDashboard() {
      try {
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
      } catch (error) {
        if (!active) {
          return;
        }

        if (controller.signal.aborted) {
          if (timedOut) {
            setState({
              status: "error",
              items: [],
              error: DASHBOARD_TIMEOUT_ERROR
            });
          }
          return;
        }

        setState({
          status: "error",
          items: [],
          error: error instanceof Error ? error.message : "Не удалось загрузить панель управления."
        });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    void loadDashboard();

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
        <Card className="p-0">
          <CardHeader className="px-6 pt-6 pb-0">
            <p className="card-kicker">Supabase</p>
            <h2 className="card-heading">Панель пока недоступна</h2>
            <p className="muted-copy">{getDashboardErrorMessage(state.error)}</p>
          </CardHeader>
          <CardFooter className="action-row dashboard-card-actions border-0 bg-transparent px-6 pt-0 pb-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setState(initialState);
                setRetryKey((value) => value + 1);
              }}
            >
              Повторить
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {state.status === "ready" ? <DashboardOverview dashboard={dashboard} /> : null}
    </main>
  );
}
