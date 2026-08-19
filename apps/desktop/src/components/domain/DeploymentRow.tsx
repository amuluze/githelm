import { Badge } from "@githelm/ui";
import type { Deployment, DeploymentStatus } from "@githelm/core";
import { formatDuration, formatRelativeTime, shortSha } from "@githelm/core";
import { GitCommit } from "lucide-react";

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  queued: "排队中",
  building: "构建中",
  deploying: "部署中",
  live: "已上线",
  failed: "失败",
  "rolled-back": "已回滚",
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
  /** Opens the deployment's log viewer when the row is clickable. */
  onOpen?: (deployment: Deployment) => void;
}

export const DeploymentRow = ({
  deployment,
  projectName,
  onOpen,
}: DeploymentRowProps) => {
  const body = (
    <>
      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--th-sf-05)]">
        <GitCommit className="h-4 w-4 th-text-strong" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="rounded-md bg-[var(--th-on-05)] px-1.5 py-0.5 font-mono text-[11px] th-text-secondary">
            {shortSha(deployment.commitSha)}
          </code>
          <span className="truncate text-sm th-text-strong">
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
          <span>{formatRelativeTime(deployment.startedAt, new Date(), "zh")}</span>
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
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(deployment)}
        title="查看部署日志"
        className="flex w-full items-center gap-4 border-b border-[var(--th-divider)] px-5 py-3 text-left last:border-b-0 hover:bg-[var(--th-sf-03)]"
      >
        {body}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-4 border-b border-[var(--th-divider)] px-5 py-3 last:border-b-0 hover:bg-[var(--th-sf-03)]">
      {body}
    </div>
  );
};