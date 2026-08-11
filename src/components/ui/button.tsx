import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-semibold transition-[color,background-color,border-color,box-shadow,transform] outline-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-[var(--brand)] bg-[var(--brand)] text-white shadow-[var(--shadow-brand)] hover:border-[var(--brand-strong)] hover:bg-[var(--brand-strong)]",
        secondary: "border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] shadow-[var(--shadow-xs)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-subtle)]",
        outline: "border border-[var(--line-strong)] bg-transparent text-[var(--ink)] hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand-strong)]",
        ghost: "border border-transparent text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]",
        soft: "border border-transparent bg-[var(--brand-soft)] text-[var(--brand-strong)] hover:bg-[var(--brand-soft-strong)]",
        destructive: "border border-[var(--danger)] bg-[var(--danger)] text-white hover:brightness-95",
      },
      size: {
        sm: "h-9 px-3 text-xs [&_svg]:size-3.5",
        default: "h-10 px-4 text-[13px] [&_svg]:size-4",
        lg: "h-11 px-5 text-sm [&_svg]:size-4",
        icon: "size-9 p-0 [&_svg]:size-4",
        "icon-sm": "size-8 p-0 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
