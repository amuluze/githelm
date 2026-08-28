import type { Project } from "@githelm/core";
import { formatRelativeTime } from "@githelm/core";
import { Badge, StatusDot } from "@githelm/ui";
import { Activity, ExternalLink, GitBranch } from "lucide-react";
import { Link } from "react-router-dom";
import { useNow } from "../../hooks/useNow";

const STATUS_LABEL: Record<Project["status"], string> = {
  running: "运行中",
  stopped: "已停止",
  building: "构建中",
  error: "异常",
  idle: "空闲",
};

const STATUS_VARIANT: Record<
  Project["status"],
  "success" | "muted" | "warning" | "danger" | "info"
> = {
  running: "success",
  stopped: "muted",
  building: "warning",
  error: "danger",
  idle: "info",
};

export interface ProjectCardProps {
  project: Project;
}

/** Project tile on the 项目 grid — same card chrome as githelm.pen ($r16, divider stroke). */
export function ProjectCard({ project }: ProjectCardProps) {
  const now = useNow();
  return (
    <Link
      to={`/projects/${project.id}`}
      className="th-card flex h-full flex-col gap-3 rounded-2xl p-5 transition-colors hover:bg-[var(--th-bg-hover)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[15px] th-text-strong">
            {project.name}
          </span>
          <span className="flex items-center gap-1 truncate text-xs th-text-muted">
            <GitBranch className="h-3 w-3" />
            {project.repository}
          </span>
        </div>
        <Badge variant={STATUS_VARIANT[project.status]}>
          <StatusDot
            status={
              project.status === "running"
                ? "running"
                : project.status === "error"
                  ? "error"
                  : "idle"
            }
          />
          {STATUS_LABEL[project.status]}
        </Badge>
      </div>

      {project.url && (
        <a
          href={project.url}
          className="th-link flex items-center gap-1.5 truncate text-xs"
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          {project.url}
        </a>
      )}

      <div className="mt-auto flex items-center justify-between text-xs th-text-muted">
        <span className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          {project.deploymentCount}
          {" "}
          次部署
        </span>
        <span>
          创建于
          {formatRelativeTime(project.createdAt, now, "zh")}
        </span>
      </div>
    </Link>
  );
}
