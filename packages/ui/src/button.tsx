import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import type { ComponentProps } from "react";
import { extendTailwindMerge } from "tailwind-merge";

const mergeClasses = extendTailwindMerge({
  extend: { theme: { text: ["ui", "label"], radius: ["control", "panel"] } },
});

// Adapted from the shadcn/ui button pattern for native buttons and styled links.
export const buttonVariants = cva(
  "inline-flex min-h-8 shrink-0 items-center justify-center gap-2 rounded-control text-ui font-medium transition-colors duration-(--transition-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
        outline:
          "border border-control-border bg-surface text-foreground hover:bg-surface-muted",
        ghost:
          "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      },
      size: {
        default: "px-3 py-1.5",
        icon: "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      type={type}
      className={mergeClasses(
        clsx(buttonVariants({ variant, size }), className),
      )}
      {...props}
    />
  );
}
