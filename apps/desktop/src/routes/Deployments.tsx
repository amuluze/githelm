import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Activity as ActivityIcon, Check, ChevronDown, Layers, Plus, Rocket, Search, X, Zap } from "lucide-react";
import type { DeploymentStatus } from "@githelm/core";
import { api } from "../lib/api";
import { PageHeader } from "../components/domain/PageHeader";
import { DeploymentRow } from "../components/domain/DeploymentRow";
import { WindowIllustration } from "../components/domain/Illustrations";

/** deployments-mock in githelm.pen: toolbar + list card + overview rail. */

type StatusTab = "all" | DeploymentStatus;

const TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "all", label: "全部" },
  { key: "live", label: "成功" },
  { key: "failed", label: "失败" },
  { key: "building", label: "构建中" },
  { key: "rolled-back", label: "已取消" },
];

export const DeploymentsPage = () => {
  const navigate = useNavigate();
  const deployments = useQuery({
    queryKey: ["deployments"],
    queryFn: () => api.listDeployments(undefined),
  });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const [search, setSearch] = useState("");
  const [project, setProject] = useState<string>("all");
  const [tab, setTab] = useState<StatusTab>("all");

  const projectById = useMemo(
    () => new Map((projects.data ?? []).map((p) => [p.id, p])),
    [projects.data],
  );

  const all = deployments.data ?? [];
  const visible = useMemo(() => {
    let list = all;
    if (project !== "all") list = list.filter((d) => d.projectId === project);
    if (tab !== "all") list = list.filter((d) => d.status === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.commitMessage.toLowerCase().includes(q) ||
          d.commitSha.toLowerCase().includes(q) ||
          d.author.toLowerCase().includes(q) ||
          (projectById.get(d.projectId)?.name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [all, project, tab, search, projectById]);

  const projectCount = new Set(all.map((d) => d.projectId)).size;
  const success = all.filter((d) => d.status === "live").length;
  const failed = all.filter((d) => d.status === "failed").length;

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title="部署"
          description={`${projectCount} 个项目共 ${all.length} 次`}
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
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-[13px] outline-none placeholder:th-text-muted"
            />
          </div>

          <div className="relative flex h-9 items-center">
            <Layers className="pointer-events-none absolute left-3 h-3.5 w-3.5 th-text-secondary" />
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="h-full appearance-none rounded-[10px] border th-bd-default th-bg-card pl-[34px] pr-8 text-[13px] th-text-strong outline-none"
            >
              <option value="all">所有项目</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 th-text-muted" />
          </div>

          <div className="flex items-center gap-1">
            {TABS.map((t) => (
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
            {deployments.isLoading ? (
              <div className="flex flex-1 items-center justify-center text-sm th-text-muted">
                加载中…
              </div>
            ) : visible.length === 0 ? (
              <DeploymentsEmpty />
            ) : (
              visible.map((d) => (
                <DeploymentRow
                  key={d.id}
                  deployment={d}
                  projectName={projectById.get(d.projectId)?.name}
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
                导入 Git 仓库或使用模板来创建你的第一次部署。
              </p>
              <button
                type="button"
                onClick={() => navigate("/library")}
                className="text-left text-[13px] th-text-strong hover:opacity-80"
              >
                部署项目 →
              </button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

const StatRow = ({
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
}) => (
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

const DeploymentsEmpty = () => {
  const navigate = useNavigate();
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
          onClick={() => navigate("/library")}
          className="th-btn th-btn-primary px-[18px] py-2.5"
        >
          <Plus className="h-3.5 w-3.5" />
          部署项目
        </button>
        <button type="button" className="th-btn th-btn-soft px-[18px] py-2.5">
          浏览模板
        </button>
      </div>
    </div>
  );
};
