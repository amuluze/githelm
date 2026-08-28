import { cn } from "../lib/cn";

/** React 19: `ref` rides along as a regular prop (no forwardRef needed). */

export function Card({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-th-bd-subtle bg-th-bg-elevated text-th-text-body shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ref, ...props }: React.ComponentProps<"div">) {
  return <div ref={ref} className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />;
}

export function CardTitle({ className, ref, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      ref={ref}
      className={cn("text-base font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ref, ...props }: React.ComponentProps<"p">) {
  return <p ref={ref} className={cn("text-sm text-th-text-muted", className)} {...props} />;
}

export function CardContent({ className, ref, ...props }: React.ComponentProps<"div">) {
  return <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      className={cn("flex items-center justify-between p-4 pt-0", className)}
      {...props}
    />
  );
}
