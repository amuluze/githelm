import type { Deployment } from "@githelm/core";
import { formatDuration, formatRelativeTime, shortSha } from "@githelm/core";
import { Badge } from "@githelm/ui";
import { GitCommit } from "lucide-react";
import { useNow } from "../../hooks/useNow";
import {
  DEPLOYMENT_STATUS_LABEL,
  DEPLOYMENT_STATUS_VARIANT,
} from "../../lib/deployment";

export interface DeploymentRowProps {
  deployment: Deployment;
  projectName?: string;
  /** Opens the deployment's log viewer when the row is clickable. */
  onOpen?: (deployment: Deployment) => void;
}

export function DeploymentRow({
  deployment,
  projectName,
  onOpen,
}: DeploymentRowProps) {
  const now = useNow();
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
          <span>{formatRelativeTime(deployment.startedAt, now, "zh")}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs th-text-muted">
          {formatDuration(deployment.durationMs)}
        </span>
        <Badge variant={DEPLOYMENT_STATUS_VARIANT[deployment.status]}>
          {DEPLOYMENT_STATUS_LABEL[deployment.status]}
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
}
