"use client"

import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
}) {
  const defaultClassNames = getDefaultClassNames()
  const isDropdownCaption = captionLayout?.startsWith("dropdown")

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("bg-background p-3 text-foreground", className)}
      captionLayout={captionLayout}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("flex flex-col gap-4 md:flex-row", defaultClassNames.months),
        month: cn(
          isDropdownCaption
            ? "grid w-full grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-x-2 gap-y-3"
            : "flex w-full flex-col gap-3",
          defaultClassNames.month
        ),
        nav: cn("absolute inset-x-0 top-0 flex items-center justify-between", defaultClassNames.nav),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant, size: "icon" }),
          "size-8 rounded-md border border-transparent p-0 text-[color:rgba(24,33,48,0.78)] shadow-none hover:bg-[color:rgba(240,236,229,0.72)] hover:text-foreground",
          isDropdownCaption && "col-start-1 row-start-1",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant, size: "icon" }),
          "size-8 rounded-md border border-transparent p-0 text-[color:rgba(24,33,48,0.78)] shadow-none hover:bg-[color:rgba(240,236,229,0.72)] hover:text-foreground",
          isDropdownCaption && "col-start-3 row-start-1",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          isDropdownCaption
            ? "col-start-2 row-start-1 flex min-h-8 items-center justify-center"
            : "flex min-h-8 items-center justify-center px-9",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          isDropdownCaption
            ? "inline-flex h-[34px] min-w-0 items-center justify-between gap-2 rounded-md border border-[rgba(18,27,43,0.1)] bg-[rgba(255,250,244,0.94)] px-2.5 pr-2 text-[0.92rem] leading-none font-medium text-[color:rgba(24,33,48,0.9)] shadow-[0_1px_2px_rgba(18,27,43,0.04)] transition-colors group-hover:bg-[rgba(247,241,233,0.98)] group-hover:border-[rgba(18,27,43,0.14)] group-focus-within:border-[color:rgba(208,106,66,0.32)] group-focus-within:bg-[rgba(255,252,248,0.98)]"
            : "text-sm font-medium text-foreground",
          defaultClassNames.caption_label
        ),
        dropdowns: cn(
          "flex min-h-8 items-center justify-center gap-2 text-sm font-medium text-foreground",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn("group relative inline-flex min-w-0 items-center", defaultClassNames.dropdown_root),
        dropdown: cn(
          isDropdownCaption
            ? "absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none rounded-md opacity-0"
            : "h-8 rounded-md border border-[rgba(18,27,43,0.12)] bg-white px-2.5 text-sm font-medium text-foreground shadow-none outline-none transition-colors focus-visible:border-[color:var(--color-ring)] focus-visible:ring-2 focus-visible:ring-ring/15",
          defaultClassNames.dropdown
        ),
        months_dropdown: cn("min-w-[7.5rem]", defaultClassNames.months_dropdown),
        years_dropdown: cn("min-w-[5.75rem]", defaultClassNames.years_dropdown),
        month_grid: cn(isDropdownCaption && "col-span-3 row-start-2", "w-full border-collapse", defaultClassNames.month_grid),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn("flex-1 text-[0.8rem] font-medium text-[color:rgba(24,33,48,0.68)]", defaultClassNames.weekday),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        day: cn("relative aspect-square h-9 w-9 p-0 text-center text-[color:rgba(24,33,48,0.92)]", defaultClassNames.day),
        day_button: cn(
          "flex size-9 items-center justify-center rounded-md border border-transparent p-0 font-normal text-inherit transition-colors hover:bg-[color:rgba(228,217,201,0.86)] hover:text-[color:rgba(24,33,48,0.98)] focus-visible:border-[color:var(--color-ring)] focus-visible:ring-2 focus-visible:ring-ring/15 aria-selected:border-[rgba(208,106,66,0.36)] aria-selected:bg-[color:rgba(227,208,182,0.9)] aria-selected:text-[color:rgba(24,33,48,0.99)] aria-selected:font-semibold aria-selected:shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] aria-selected:opacity-100",
          defaultClassNames.day_button
        ),
        selected: cn("bg-transparent text-inherit", defaultClassNames.selected),
        today: cn("font-medium text-[color:rgba(24,33,48,0.92)]", defaultClassNames.today),
        outside: cn("text-[color:rgba(24,33,48,0.46)] opacity-100 aria-selected:text-[color:rgba(24,33,48,0.68)]", defaultClassNames.outside),
        disabled: cn("text-[color:rgba(24,33,48,0.4)] opacity-100", defaultClassNames.disabled),
        range_middle: cn("aria-selected:bg-muted aria-selected:text-foreground", defaultClassNames.range_middle),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className, ...iconProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", className)} {...iconProps} />
          ) : orientation === "down" ? (
            <ChevronDown className={cn("size-4", className)} {...iconProps} />
          ) : (
            <ChevronRight className={cn("size-4", className)} {...iconProps} />
          ),
        ...components,
      }}
      {...props}
    />
  )
}

export { Calendar }
