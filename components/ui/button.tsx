import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] outline-none select-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/18 active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-[0_18px_38px_-24px_color-mix(in_oklab,var(--color-primary)_82%,transparent)] hover:bg-[color:color-mix(in_oklab,var(--color-primary)_90%,black_10%)] hover:border-[color:color-mix(in_oklab,var(--color-primary)_90%,black_10%)]",
        outline:
          "border-border bg-card text-foreground hover:bg-[color:var(--bg-soft)] hover:border-[color:var(--color-ring)]",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-[color:color-mix(in_oklab,var(--color-secondary)_85%,white_15%)]",
        ghost:
          "border-transparent bg-transparent text-foreground hover:bg-[color:var(--accent-pale)] hover:text-foreground",
        destructive:
          "border-[color:color-mix(in_oklab,var(--color-destructive)_18%,transparent)] bg-[color:color-mix(in_oklab,var(--color-destructive)_10%,white_90%)] text-destructive hover:bg-[color:color-mix(in_oklab,var(--color-destructive)_16%,white_84%)] focus-visible:border-destructive/40 focus-visible:ring-destructive/15",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-4 text-[0.95rem] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-sm px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-sm px-3 text-[0.85rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-5 text-[0.98rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-11",
        "icon-xs":
          "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-9 rounded-sm",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
