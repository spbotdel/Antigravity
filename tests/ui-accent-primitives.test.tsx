import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

describe("accent primitive contracts", () => {
  it("uses terracotta styling for primary buttons", () => {
    const className = buttonVariants();

    expect(className).toContain("bg-[color:var(--accent-primary)]");
    expect(className).toContain("border-[color:var(--accent-primary)]");
    expect(className).toContain("hover:bg-[color:var(--accent-primary-hover)]");
  });

  it("keeps tab active state on the shared accent tokens", () => {
    render(
      <Tabs defaultValue="person">
        <TabsList>
          <TabsTrigger value="person">Персона</TabsTrigger>
          <TabsTrigger value="media">Медиа</TabsTrigger>
        </TabsList>
      </Tabs>
    );

    const activeTab = screen.getByRole("tab", { name: "Персона" });
    expect(activeTab.className).toContain("data-active:border-[color:var(--accent-primary)]");
    expect(activeTab.className).toContain("data-active:bg-[color:var(--accent-soft)]");
  });
});
