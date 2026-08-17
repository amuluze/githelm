import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-th-sf-06 text-th-text-body",
        success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        danger: "bg-red-500/15 text-red-600 dark:text-red-400",
        info: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
        muted: "bg-th-sf-04 text-th-text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);