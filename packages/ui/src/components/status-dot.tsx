import { cn } from "../lib/cn";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: "running" | "stopped" | "pending" | "error" | "idle";
}

const STATUS_COLOR: Record<StatusDotProps["status"], string> = {
  running: "bg-emerald-500",
  stopped: "bg-th-on-25",
  pending: "bg-amber-500 animate-pulse",
  error: "bg-red-500",
  idle: "bg-sky-500",
};

export function StatusDot({ status, className, ...props }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        STATUS_COLOR[status],
        className,
      )}
      aria-label={status}
      {...props}
    />
  );
}
