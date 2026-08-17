import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  Github,
  Rocket,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusDot,
} from "@githelm/ui";
import { formatDuration } from "@githelm/core";
import { api } from "../lib/api";
import { PageHeader } from "../components/domain/PageHeader";
import { DeploymentRow } from "../components/domain/DeploymentRow";

export const ProjectDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const list = await api.listProjects();
      return list.find((p) => p.id === id) ?? null;
    },
    enabled: Boolean(id),
  });
  const deployments = useQuery({
    queryKey: ["deployments", id],
    queryFn: () => api.listDeployments(id),
    enabled: Boolean(id),
  });

  if (project.isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm th-text-muted">
        Loading project…
      </div>
    );
  }

  if (!project.data) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2">
        <p className="text-sm th-text-muted">Project not found.</p>
        <Link to="/projects" className="th-link text-xs">
          ← Back to projects
        </Link>
      </div>
    );
  }

  const p = project.data;
  const liveDeployment = (deployments.data ?? []).find(
    (d) => d.status === "live",
  );

  return (
    <div>
      <PageHeader
        title={p.name}
        description={`${p.repository} · ${p.branch}`}
        actions={
          <>
            {p.url && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(p.url!, "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Visit
              </Button>
            )}
            <Button size="sm">
              <Rocket className="h-4 w-4" />
              Deploy
            </Button>
          </>
        }
      />

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Status</CardDescription>
              <CardTitle className="flex items-center gap-2 capitalize">
                <StatusDot
                  status={
                    p.status === "running"
                      ? "running"
                      : p.status === "error"
                        ? "error"
                        : "idle"
                  }
                />
                {p.status}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-xs th-text-muted">
              <Github className="h-3 w-3" />
              <span className="truncate">{p.repository}</span>
              <span aria-hidden>·</span>
              <GitBranch className="h-3 w-3" />
              <span>{p.branch}</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Latest deployment</CardDescription>
              <CardTitle>
                {liveDeployment ? "Live" : "No live deployment"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs th-text-muted">
              {liveDeployment
                ? `Built in ${formatDuration(liveDeployment.durationMs)}`
                : "Trigger a deployment to publish this project."}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Total deployments</CardDescription>
              <CardTitle className="text-2xl">{p.deploymentCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs th-text-muted">
              {deployments.data?.length ?? 0} shown on this page
            </CardContent>
          </Card>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider th-text-muted">
              Deployments
            </h2>
            <Link to="/deployments" className="th-link text-xs">
              View all →
            </Link>
          </div>
          <Card className="overflow-hidden p-0">
            <CardContent className="p-0">
              {(deployments.data ?? []).length === 0 ? (
                <div className="px-4 py-12 text-center text-sm th-text-muted">
                  No deployments yet.
                </div>
              ) : (
                (deployments.data ?? []).map((d) => (
                  <DeploymentRow
                    key={d.id}
                    deployment={d}
                    projectName={p.name}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <div>
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-xs th-text-muted hover:th-text-title"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to projects
          </Link>
        </div>
      </div>
    </div>
  );
};