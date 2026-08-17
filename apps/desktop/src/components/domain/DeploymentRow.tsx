import { Badge } from "@githelm/ui";
import type { Deployment, DeploymentStatus } from "@githelm/core";
import { formatDuration, formatRelativeTime, shortSha } from "@githelm/core";
import { GitCommit } from "lucide-react";

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  queued: "Queued",
  building: "Building",
  deploying: "Deploying",
  live: "Live",
  failed: "Failed",
  "rolled-back": "Rolled back",
};

const STATUS_VARIANT: Record<
  DeploymentStatus,
  "muted" | "warning" | "info" | "success" | "danger"
> = {
  queued: "muted",
  building: "warning",
  deploying: "info",
  live: "success",
  failed: "danger",
  "rolled-back": "muted",
};

export interface DeploymentRowProps {
  deployment: Deployment;
  projectName?: string;
}

export const DeploymentRow = ({ deployment, projectName }: DeploymentRowProps) => (
  <div className="flex items-center gap-4 border-b th-bd-subtle px-4 py-3 last:border-b-0 hover:bg-[var(--th-sf-03)]">
    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--th-sf-06)]">
      <GitCommit className="h-3.5 w-3.5" />
    </div>

    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <code className="rounded bg-[var(--th-sf-06)] px-1.5 py-0.5 text-[11px] font-mono">
          {shortSha(deployment.commitSha)}
        </code>
        <span className="truncate text-sm font-medium th-text-title">
          {deployment.commitMessage}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs th-text-muted">
        <span>{deployment.author}</span>
        {projectName && (
          <>
            <span aria-hidden>·</span>
            <span>{projectName}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span>{formatRelativeTime(deployment.startedAt)}</span>
      </div>
    </div>

    <div className="flex items-center gap-3">
      <span className="text-xs th-text-muted">
        {formatDuration(deployment.durationMs)}
      </span>
      <Badge variant={STATUS_VARIANT[deployment.status]}>
        {STATUS_LABEL[deployment.status]}
      </Badge>
    </div>
  </div>
);