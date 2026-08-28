import type { Deployment, DeploymentStatus, Project } from "@githelm/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  Check,
  ChevronDown,
  Folder,
  Layers,
  Plus,
  Rocket,
  Search,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DeployDialog } from "../components/domain/DeployDialog";
import { DeploymentLogsDialog } from "../components/domain/DeploymentLogsDialog";
import { DeploymentRow } from "../components/domain/DeploymentRow";
import { WindowIllustration } from "../components/domain/Illustrations";
import { PageHeader } from "../components/domain/PageHeader";
import { api } from "../lib/api";

/** deployments-mock in githelm.pen: toolbar + list card + overview rail. */

type StatusTab = "all" | DeploymentStatus;

const TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "all", label: "全部" },
  { key: "live", label: "成功" },
  { key: "failed", label: "失败" },
  { key: "building", label: "构建中" },
  { key: "cancelled", label: "已取消" },
  { key: "rolled-back", label: "已回滚" },
];

export function DeploymentsPage() {
  const queryClient = useQueryClient();
  const deployments = useQuery({
    queryKey: ["deployments"],
    queryFn: () => api.listDeployments(undefined),
    // Status badges stay fresh via the deploy-status event subscription in
    // useDeployEvents — no polling here.
  });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const [search, setSearch] = useState("");
  const [project, setProject] = useState<string>("all");
  const [tab, setTab] = useState<StatusTab>("all");
  const [picking, setPicking] = useState(false);
  const [deployProject, setDeployProject] = useState<Project | null>(null);
  const [logDeploymentId, setLogDeploymentId] = useState<string | null>(null);

  const projectById = useMemo(
    () => new Map((projects.data ?? []).map(p => [p.id, p])),
    [projects.data],
  );

  // Memoized so the `visible` useMemo below gets a stable dependency.
  const all = useMemo(() => deployments.data ?? [], [deployments.data]);
  const visible = useMemo(() => {
    let list = all;
    if (project !== "all")
      list = list.filter(d => d.projectId === project);
    if (tab !== "all")
      list = list.filter(d => d.status === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        d =>
          d.commitMessage.toLowerCase().includes(q)
          || d.commitSha.toLowerCase().includes(q)
          || d.author.toLowerCase().includes(q)
          || (projectById.get(d.projectId)?.name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [all, project, tab, search, projectById]);

  const projectCount = new Set(all.map(d => d.projectId)).size;
  const success = all.filter(d => d.status === "live").length;
  const failed = all.filter(d => d.status === "failed").length;

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title="部署"
          description={`${projectCount} 个项目共 ${all.length} 次`}
          actions={(
            <button
              type="button"
              className="th-btn th-btn-primary"
              onClick={() => setPicking(true)}
            >
              <Rocket className="h-3.5 w-3.5" />
              部署
            </button>
          )}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-8 pb-8 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-[300px] items-center gap-2 rounded-[10px] border th-bd-default th-bg-card px-3">
            <Search className="h-3.5 w-3.5 th-text-muted" />
            <input
              type="search"
              placeholder="搜索部署…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-transparent text-[13px] outline-none placeholder:th-text-muted"
            />
          </div>

          <div className="relative flex h-9 items-center">
            <Layers className="pointer-events-none absolute left-3 h-3.5 w-3.5 th-text-secondary" />
            <select
              value={project}
              onChange={e => setProject(e.target.value)}
              className="h-full appearance-none rounded-[10px] border th-bd-default th-bg-card pl-[34px] pr-8 text-[13px] th-text-strong outline-none"
            >
              <option value="all">所有项目</option>
              {(projects.data ?? []).map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 th-text-muted" />
          </div>

          <div className="flex items-center gap-1">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={
                  tab === t.key
                    ? "rounded-lg bg-[var(--th-sf-05)] px-3 py-[7px] text-[13px] th-text-strong"
                    : "rounded-lg px-3 py-[7px] text-[13px] th-text-secondary transition-colors hover:th-text-strong"
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-5">
          <section className="th-card flex min-h-0 flex-1 flex-col overflow-auto">
            {deployments.isLoading
              ? (
                  <div className="flex flex-1 items-center justify-center text-sm th-text-muted">
                    加载中…
                  </div>
                )
              : deployments.isError
                ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                      <p className="text-sm th-text-muted">
                        部署记录加载失败：
                        {deployments.error.message}
                      </p>
                      <button
                        type="button"
                        onClick={() => void deployments.refetch()}
                        className="th-btn th-btn-soft px-3.5"
                      >
                        重试
                      </button>
                    </div>
                  )
                : visible.length === 0
                  ? (
                      <DeploymentsEmpty onDeploy={() => setPicking(true)} />
                    )
                  : (
                      visible.map(d => (
                        <DeploymentRow
                          key={d.id}
                          deployment={d}
                          projectName={projectById.get(d.projectId)?.name}
                          onOpen={(dep: Deployment) => setLogDeploymentId(dep.id)}
                        />
                      ))
                    )}
          </section>

          <aside className="flex w-[300px] shrink-0 flex-col gap-5">
            <section className="th-card flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <ActivityIcon className="h-4 w-4 th-text-strong" />
                <h2 className="text-sm th-text-strong">概览</h2>
              </div>
              <StatRow
                chipClass="bg-[var(--th-sf-05)]"
                icon={Rocket}
                iconClass="th-text-strong"
                label="总计"
                value={all.length}
              />
              <StatRow
                chipClass="bg-[var(--th-success-bg)]"
                icon={Check}
                iconClass="text-[var(--th-success-fg)]"
                label="成功"
                value={success}
              />
              <StatRow
                chipClass="bg-[var(--th-danger-bg)]"
                icon={X}
                iconClass="text-[var(--th-danger-fg)]"
                label="失败"
                value={failed}
              />
            </section>

            <section className="th-bg-card-2 flex flex-col gap-2 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 th-text-strong" />
                <h2 className="text-sm th-text-strong">开始使用</h2>
              </div>
              <p className="text-[13px] leading-[1.5] th-text-secondary">
                选择一个项目，配置本地构建与服务器目录后即可发布。
              </p>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="text-left text-[13px] th-text-strong hover:opacity-80"
              >
                部署项目 →
              </button>
            </section>
          </aside>
        </div>
      </div>

      {picking && (
        <ProjectPicker
          projects={projects.data ?? []}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setPicking(false);
            setDeployProject(p);
          }}
        />
      )}

      {deployProject && (
        <DeployDialog
          project={deployProject}
          onClose={() => setDeployProject(null)}
          onStarted={(dep) => {
            setDeployProject(null);
            void queryClient.invalidateQueries({ queryKey: ["deployments"] });
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            setLogDeploymentId(dep.id);
          }}
        />
      )}

      {logDeploymentId && (
        <DeploymentLogsDialog
          deploymentId={logDeploymentId}
          onClose={() => {
            setLogDeploymentId(null);
            void queryClient.invalidateQueries({ queryKey: ["deployments"] });
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
          }}
        />
      )}
    </div>
  );
}

/** Step one of deploying from this page: which project. */
function ProjectPicker({
  projects,
  onClose,
  onPick,
}: {
  projects: Project[];
  onClose: () => void;
  onPick: (project: Project) => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal
    >
      <div className="th-card flex max-h-[70vh] w-full max-w-md flex-col p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold th-text-title">选择要部署的项目</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--th-sf-06)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {projects.length === 0
          ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm th-text-muted">还没有项目</p>
                <button
                  type="button"
                  onClick={() => navigate("/library")}
                  className="th-btn th-btn-primary px-4"
                >
                  <Plus className="h-3.5 w-3.5" />
                  导入项目
                </button>
              </div>
            )
          : (
              <div className="th-bg-inset flex-1 overflow-y-auto rounded-xl">
                {projects.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onPick(p)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--th-sf-03)]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--th-sf-05)]">
                      <Folder className="h-4 w-4 th-text-strong" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm th-text-strong">{p.name}</span>
                      <span className="truncate text-xs th-text-muted">
                        {p.repository}
                        {" "}
                        ·
                        {p.branch}
                      </span>
                    </span>
                    {p.deploymentCount > 0 && (
                      <span className="shrink-0 text-xs th-text-muted">
                        {p.deploymentCount}
                        {" "}
                        次部署
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
      </div>
    </div>
  );
}

function StatRow({
  chipClass,
  icon: Icon,
  iconClass,
  label,
  value,
}: {
  chipClass: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${chipClass}`}
        >
          <Icon className={`h-[15px] w-[15px] ${iconClass}`} />
        </span>
        <span className="text-[13px] th-text-secondary">{label}</span>
      </div>
      <span className="text-[15px] th-text-strong">{value}</span>
    </div>
  );
}

function DeploymentsEmpty({ onDeploy }: { onDeploy: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-6">
      <WindowIllustration />
      <h2 className="text-lg th-text-strong">暂无部署</h2>
      <p className="max-w-[420px] text-center text-[13px] leading-[1.5] th-text-secondary">
        部署你的第一个项目后，它将连同构建状态、提交详情和性能指标一起显示在这里。
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDeploy}
          className="th-btn th-btn-primary px-[18px] py-2.5"
        >
          <Rocket className="h-3.5 w-3.5" />
          部署项目
        </button>
        <button type="button" className="th-btn th-btn-soft px-[18px] py-2.5">
          浏览模板
        </button>
      </div>
    </div>
  );
}
