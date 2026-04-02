import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FamilyTreeLandingScene } from "@/components/landing/family-tree-landing-scene";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

describe("family tree landing scene", () => {
  it("renders the isolated hero experiment with scroll narrative steps", () => {
    render(<FamilyTreeLandingScene />);

    expect(screen.getByRole("heading", { name: "Соберите семейную историю в одном рабочем дереве." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Начать с дерева" })).toHaveAttribute("href", "/auth/register");
    expect(screen.getByRole("link", { name: "Войти" })).toHaveAttribute("href", "/auth/login");
    expect(screen.getAllByText("Сначала проявляется каркас дерева.")).toHaveLength(2);
    expect(screen.getByText("Потом на ветках появляется листва памяти.")).toBeInTheDocument();
    expect(screen.getByText("В финале на передний план выходят люди.")).toBeInTheDocument();
  });
});
