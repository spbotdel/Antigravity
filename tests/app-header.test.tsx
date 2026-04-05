import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Выйти</button>
}));

import { AppHeader } from "@/components/layout/app-header";

describe("app header", () => {
  it("shows dashboard and sign-out actions for admin tree surfaces", () => {
    render(<AppHeader mode="admin" showDashboardLink />);

    expect(screen.getByText("Семейное дерево")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Панель" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("button", { name: "Выйти" })).toBeInTheDocument();
  });

  it("shows only sign-out for dashboard shell", () => {
    render(<AppHeader mode="admin" showDashboardLink={false} />);

    expect(screen.queryByRole("link", { name: "Панель" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выйти" })).toBeInTheDocument();
  });

  it("shows only sign-out for participant surfaces", () => {
    render(<AppHeader mode="participant" showDashboardLink />);

    expect(screen.queryByRole("link", { name: "Панель" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выйти" })).toBeInTheDocument();
  });

  it("shows brand area only for guest surfaces", () => {
    render(<AppHeader mode="guest" showDashboardLink />);

    expect(screen.getByText("Семейное дерево")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Выйти" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Панель" })).not.toBeInTheDocument();
  });
});
