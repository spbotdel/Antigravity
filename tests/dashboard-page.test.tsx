import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, getCurrentUser } = vi.hoisted(() => ({
  redirect: vi.fn(),
  getCurrentUser: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect
}));

vi.mock("@/lib/server/auth", () => ({
  getCurrentUser
}));

vi.mock("@/components/layout/app-header", () => ({
  AppHeader: ({ mode, showDashboardLink }: { mode: string; showDashboardLink: boolean }) => (
    <div data-testid="app-header" data-mode={mode} data-dashboard-link={String(showDashboardLink)} />
  )
}));

vi.mock("@/components/dashboard/dashboard-page-client", () => ({
  DashboardPageClient: () => <div data-testid="dashboard-page-client">dashboard</div>
}));

import DashboardPage from "@/app/dashboard/page";

describe("dashboard page", () => {
  beforeEach(() => {
    redirect.mockReset();
    getCurrentUser.mockReset();
  });

  it("renders the compact dashboard header for authenticated users", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "owner@example.com" });

    render(await DashboardPage());

    expect(screen.getByTestId("app-header")).toHaveAttribute("data-mode", "admin");
    expect(screen.getByTestId("app-header")).toHaveAttribute("data-dashboard-link", "false");
    expect(screen.getByTestId("dashboard-page-client")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects guests to login before rendering the dashboard shell", async () => {
    getCurrentUser.mockResolvedValue(null);

    await DashboardPage();

    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });
});
