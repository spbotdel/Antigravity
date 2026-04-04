import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex h-7 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-3 py-1 text-[0.78rem] font-semibold whitespace-nowrap transition-[color,background-color,border-color] focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive aria-invalid:ring-destructive/15 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-[color:var(--panel-border)] bg-secondary text-secondary-foreground",
        destructive:
          "border-[color:color-mix(in_oklab,var(--color-destructive)_18%,transparent)] bg-[color:color-mix(in_oklab,var(--color-destructive)_10%,white_90%)] text-destructive",
        outline: "border-[color:var(--panel-border)] bg-card text-foreground",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-[color:var(--accent-pale)] hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
