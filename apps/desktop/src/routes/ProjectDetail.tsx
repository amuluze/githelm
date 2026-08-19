import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, GitBranch, Github, Rocket } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusDot,
} from "@githelm/ui";
import { formatDuration } from "@githelm/core";
import type { Project } from "@githelm/core";
import { api } from "../lib/api";
import { PageHeader } from "../components/domain/PageHeader";
import { DeploymentRow } from "../components/domain/DeploymentRow";
import { DeployDialog } from "../components/domain/DeployDialog";
import { DeploymentLogsDialog } from "../components/domain/DeploymentLogsDialog";

const STATUS_LABEL: Record<Project["status"], string> = {
  running: "运行中",
  stopped: "已停止",
  building: "构建中",
  error: "异常",
  idle: "空闲",
};

export const ProjectDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [deployOpen, setDeployOpen] = useState(false);
  const [logDeploymentId, setLogDeploymentId] = useState<string | null>(null);

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
    // Keep status badges fresh while a pipeline is running.
    refetchInterval: (query) =>
      query.state.data?.some(
        (d) => d.status === "building" || d.status === "deploying",
      )
        ? 2000
        : false,
  });

  const invalidateProject = () => {
    void queryClient.invalidateQueries({ queryKey: ["project", id] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["deployments", id] });
    void queryClient.invalidateQueries({ queryKey: ["deployments"] });
  };

  if (project.isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm th-text-muted">
        加载项目中…
      </div>
    );
  }

  if (!project.data) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2">
        <p className="text-sm th-text-muted">未找到该项目。</p>
        <Link to="/projects" className="th-link text-xs">
          ← 返回项目列表
        </Link>
      </div>
    );
  }

  const p = project.data;
  const liveDeployment = (deployments.data ?? []).find((d) => d.status === "live");

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title={p.name}
          description={`${p.repository} · ${p.branch}`}
          actions={
            <>
              {p.url && (
                <button
                  type="button"
                  className="th-btn th-btn-secondary px-3.5"
                  onClick={() =>
                    window.open(p.url!, "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  访问
                </button>
              )}
              <button
                type="button"
                className="th-btn th-btn-primary"
                onClick={() => setDeployOpen(true)}
              >
                <Rocket className="h-3.5 w-3.5" />
                部署
              </button>
            </>
          }
        />
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-8 pb-8 pt-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>状态</CardDescription>
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
                {STATUS_LABEL[p.status]}
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
              <CardDescription>最近部署</CardDescription>
              <CardTitle>
                {liveDeployment ? "已上线" : "暂无在线部署"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs th-text-muted">
              {liveDeployment
                ? `构建用时 ${formatDuration(liveDeployment.durationMs)}`
                : "触发一次部署以发布该项目。"}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>部署总数</CardDescription>
              <CardTitle className="text-2xl">{p.deploymentCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs th-text-muted">
              本页展示 {deployments.data?.length ?? 0} 条
            </CardContent>
          </Card>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider th-text-muted">
              部署记录
            </h2>
            <Link to="/deployments" className="th-link text-xs">
              查看全部 →
            </Link>
          </div>
          <Card className="overflow-hidden p-0">
            <CardContent className="p-0">
              {(deployments.data ?? []).length === 0 ? (
                <div className="px-4 py-12 text-center text-sm th-text-muted">
                  暂无部署记录。
                </div>
              ) : (
                (deployments.data ?? []).map((d) => (
                  <DeploymentRow
                    key={d.id}
                    deployment={d}
                    projectName={p.name}
                    onOpen={(dep) => setLogDeploymentId(dep.id)}
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
            返回项目列表
          </Link>
        </div>
      </div>

      {deployOpen && (
        <DeployDialog
          project={p}
          onClose={() => setDeployOpen(false)}
          onStarted={(dep) => {
            invalidateProject();
            setDeployOpen(false);
            setLogDeploymentId(dep.id);
          }}
        />
      )}

      {logDeploymentId && (
        <DeploymentLogsDialog
          deploymentId={logDeploymentId}
          onClose={() => {
            setLogDeploymentId(null);
            invalidateProject();
          }}
        />
      )}
    </div>
  );
};
