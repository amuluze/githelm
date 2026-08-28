import type { DeploymentStatus } from "@githelm/core";

/** Chinese label per status — shared by the list rows and the log dialog. */
export const DEPLOYMENT_STATUS_LABEL: Record<DeploymentStatus, string> = {
  "queued": "排队中",
  "building": "构建中",
  "deploying": "部署中",
  "live": "已上线",
  "failed": "失败",
  "cancelled": "已取消",
  "rolled-back": "已回滚",
};

/** Badge variant per status — shared by the list rows. */
export const DEPLOYMENT_STATUS_VARIANT: Record<
  DeploymentStatus,
  "muted" | "warning" | "info" | "success" | "danger"
> = {
  "queued": "muted",
  "building": "warning",
  "deploying": "info",
  "live": "success",
  "failed": "danger",
  "cancelled": "muted",
  "rolled-back": "muted",
};

/** Plain-text color class per status — used where a Badge doesn't fit. */
export const DEPLOYMENT_STATUS_TEXT: Record<DeploymentStatus, string> = {
  "queued": "th-text-muted",
  "building": "text-[var(--th-warning-fg)]",
  "deploying": "text-[var(--th-warning-fg)]",
  "live": "text-[var(--th-success-fg)]",
  "failed": "text-[var(--th-danger-fg)]",
  "cancelled": "th-text-muted",
  "rolled-back": "th-text-muted",
};
