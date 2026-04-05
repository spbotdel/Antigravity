"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-3 data-horizontal:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-[10px] border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-1 text-muted-foreground shadow-[var(--surface-shadow-soft)] group-data-horizontal/tabs:min-h-12 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-[10px] data-[variant=line]:border-[color:var(--panel-border)] data-[variant=line]:bg-[color:var(--panel)] data-[variant=line]:shadow-[var(--surface-shadow-soft)]",
  {
    variants: {
      variant: {
        default: "",
        line: "gap-1",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-transparent px-3 py-2 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-[color,background-color,border-color,box-shadow] group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:border-[color:var(--border-soft)] hover:text-[color:var(--accent-primary-hover)] focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=default]/tabs-list:data-active:border-[color:var(--accent-primary)] group-data-[variant=default]/tabs-list:data-active:bg-[color:var(--accent-soft)] group-data-[variant=default]/tabs-list:data-active:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-none",
        "group-data-[variant=line]/tabs-list:px-2.5 group-data-[variant=line]/tabs-list:text-muted-foreground group-data-[variant=line]/tabs-list:data-active:border-[color:var(--accent-primary)] group-data-[variant=line]/tabs-list:data-active:bg-[color:var(--accent-soft)] group-data-[variant=line]/tabs-list:data-active:text-foreground group-data-[variant=line]/tabs-list:data-active:shadow-none",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
