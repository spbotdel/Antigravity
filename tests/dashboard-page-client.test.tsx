import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace
  })
}));

vi.mock("@/components/dashboard/dashboard-overview", () => ({
  DashboardOverview: () => <div data-testid="dashboard-overview">overview</div>
}));

import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";

describe("dashboard page client", () => {
  beforeEach(() => {
    replace.mockReset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the timeout card instead of surfacing a runtime abort when dashboard loading is aborted by the local timeout", async () => {
    vi.useFakeTimers();

    vi.spyOn(global, "fetch").mockImplementation((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (!signal) {
          return;
        }

        const abortRequest = () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        };

        if (signal.aborted) {
          abortRequest();
          return;
        }

        signal.addEventListener("abort", abortRequest, { once: true });
      });
    });

    await act(async () => {
      render(<DashboardPageClient />);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Панель пока недоступна" })).toBeInTheDocument();
    expect(screen.getByText("Сервер слишком долго отвечает при загрузке панели управления.")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-overview")).not.toBeInTheDocument();
  });
});
