import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 text-[16px] font-medium transition-colors duration-[var(--dur-ui)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-info)] active:translate-y-[1px] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        signal: "bg-[var(--color-redline)] text-white",
        ghost: "border border-[var(--color-border-strong)] text-[var(--color-text-1)]",
        info: "bg-[var(--color-info)] text-black",
      },
    },
    defaultVariants: { variant: "signal" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, asChild = false, ...props }: ButtonProps): React.JSX.Element {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant }), className)} {...props} />;
}
