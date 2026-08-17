import { Link } from "react-router-dom";
import { Github, GitBranch, ExternalLink, Activity } from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  StatusDot,
} from "@githelm/ui";
import type { Project } from "@githelm/core";
import { formatRelativeTime } from "@githelm/core";

const STATUS_LABEL: Record<Project["status"], string> = {
  running: "Running",
  stopped: "Stopped",
  building: "Building",
  error: "Error",
  idle: "Idle",
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

export const ProjectCard = ({ project }: ProjectCardProps) => (
  <Link
    to={`/projects/${project.id}`}
    className="block transition-transform hover:-translate-y-0.5"
  >
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{project.name}</CardTitle>
            <CardDescription className="mt-0.5 truncate">
              <span className="inline-flex items-center gap-1">
                <Github className="h-3 w-3" />
                {project.repository}
              </span>
            </CardDescription>
          </div>
          <Badge variant={STATUS_VARIANT[project.status]}>
            <StatusDot status={project.status === "running" ? "running" : project.status === "error" ? "error" : "idle"} />
            {STATUS_LABEL[project.status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-xs th-text-muted">
          <GitBranch className="h-3 w-3" />
          <span className="truncate">{project.branch}</span>
        </div>
        {project.url && (
          <div className="flex items-center gap-2 text-xs">
            <ExternalLink className="h-3 w-3 th-text-subtle" />
            <a
              href={project.url}
              className="th-link truncate"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {project.url}
            </a>
          </div>
        )}
      </CardContent>

      <CardFooter className="text-xs th-text-muted">
        <span className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          {project.deploymentCount} deployments
        </span>
        <span>Created {formatRelativeTime(project.createdAt)}</span>
      </CardFooter>
    </Card>
  </Link>
);