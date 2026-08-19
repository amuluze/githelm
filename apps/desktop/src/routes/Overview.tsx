import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  Check,
  Folder,
  GitBranch,
  Plus,
  Rocket,
  Settings,
  Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Project } from "@githelm/core";
import { OrbitIllustration } from "../components/domain/Illustrations";

/** home-mock in githelm.pen: greeting + projects card + quick actions + activity rail. */

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
};

export const OverviewPage = () => {
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const deployments = useQuery({
    queryKey: ["deployments"],
    queryFn: () => api.listDeployments(undefined),
  });
  const servers = useQuery({ queryKey: ["servers"], queryFn: api.listServers });

  const list = projects.data ?? [];
  const errored = list.filter((p) => p.status === "error").length;
  const onlineServers = (servers.data ?? []).filter((s) => s.status === "online").length;

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-normal leading-tight tracking-[-0.2px] th-text-strong">
          {greeting()}，Local
        </h1>
        <p className="text-sm th-text-secondary">这是你各个项目的最新动态</p>
      </header>

      <div className="flex min-h-0 flex-1 gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <ProjectsCard projects={list} />
          <div className="grid shrink-0 grid-cols-3 gap-4">
            <QuickAction
              to="/library"
              icon={GitBranch}
              title="导入 Git"
              sub="从代码仓库导入"
            />
            <QuickAction
              to="/settings"
              icon={Settings}
              title="设置"
              sub="账户与团队"
            />
            <QuickAction to="/library" icon={BookOpen} title="文档" sub="了解更多" />
          </div>
        </div>

        <div className="flex w-[300px] shrink-0 flex-col gap-4">
          <section className="th-card flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 th-text-strong" />
              <h2 className="text-sm th-text-strong">动态</h2>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-3">
              <ActivityRow
                chipClass="bg-[var(--th-sf-05)]"
                icon={Folder}
                iconClass="th-text-strong"
                label="项目"
                value={String(list.length)}
              />
              <ActivityRow
                chipClass="bg-[var(--th-orange-bg)]"
                icon={Rocket}
                iconClass="text-[var(--th-orange-fg)]"
                label="部署"
                value={String(deployments.data?.length ?? 0)}
              />
              <div className="h-px bg-[var(--th-divider)]" />
              <ActivityRow
                chipClass="bg-[var(--th-success-bg)]"
                icon={Check}
                iconClass="text-[var(--th-success-fg)]"
                label="系统状态"
                value={errored === 0 ? "正常" : `${errored} 个异常`}
                valueClass={
                  errored === 0 ? "text-[var(--th-success-fg)]" : "text-[var(--th-danger-fg)]"
                }
              />
              <ActivityRow
                chipClass="bg-[var(--th-sf-05)]"
                icon={Rocket}
                iconClass="th-text-strong"
                label="服务器"
                value={`${onlineServers} 在线`}
              />
            </div>
          </section>

          <section className="th-bg-card-2 flex shrink-0 flex-col gap-2 rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 th-text-strong" />
              <h2 className="text-sm th-text-strong">快速提示</h2>
            </div>
            <p className="text-[13px] leading-[1.5] th-text-secondary">
              创建你的第一个项目以开始部署。
            </p>
            <Link to="/library" className="text-[13px] th-text-strong hover:opacity-80">
              新建项目 →
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
};

const QuickAction = ({
  to,
  icon: Icon,
  title,
  sub,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}) => (
  <Link
    to={to}
    className="th-card flex flex-col gap-1.5 rounded-xl p-3.5 transition-colors hover:bg-[var(--th-bg-hover)]"
  >
    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[var(--th-sf-05)]">
      <Icon className="h-4 w-4 th-text-strong" />
    </span>
    <span className="text-sm th-text-strong">{title}</span>
    <span className="text-xs th-text-muted">{sub}</span>
  </Link>
);

const ActivityRow = ({
  chipClass,
  icon: Icon,
  iconClass,
  label,
  value,
  valueClass = "th-text-strong",
}: {
  chipClass: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  label: string;
  value: string;
  valueClass?: string;
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
    <span className={`text-[15px] ${valueClass}`}>{value}</span>
  </div>
);

const STATUS_LABEL: Record<Project["status"], string> = {
  running: "运行中",
  stopped: "已停止",
  building: "构建中",
  error: "异常",
  idle: "空闲",
};

const STATUS_COLOR: Record<Project["status"], string> = {
  running: "var(--th-success-fg)",
  stopped: "var(--th-text-muted)",
  building: "var(--th-warning-fg)",
  error: "var(--th-danger-fg)",
  idle: "var(--th-text-muted)",
};

const ProjectsCard = ({ projects }: { projects: Project[] }) => {
  const navigate = useNavigate();

  return (
    <section className="th-card flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--th-sf-05)]">
          <Folder className="h-[18px] w-[18px] th-text-strong" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] th-text-strong">你的项目</h2>
          <span className="text-xs th-text-muted">{projects.length} 个项目</span>
        </div>
        <span className="flex-1" />
        <Link
          to="/projects"
          className="text-[13px] th-text-secondary hover:th-text-strong"
        >
          查看全部 →
        </Link>
      </div>
      <div className="h-px bg-[var(--th-divider)]" />

      {projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-6">
          <OrbitIllustration />
          <h3 className="text-lg th-text-strong">启动你的第一个项目</h3>
          <p className="max-w-[420px] text-center text-[13px] leading-[1.5] th-text-secondary">
            连接仓库或从模板开始 —— Githelm
            会构建、发布，并在几分钟内为你提供一个可访问的 URL。
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/library")}
              className="th-btn th-btn-primary px-4 py-2.5"
            >
              <Plus className="h-3.5 w-3.5" />
              创建项目
            </button>
            <button
              type="button"
              onClick={() => navigate("/library")}
              className="th-btn th-btn-secondary px-4 py-2.5"
            >
              从 GitHub 导入
            </button>
          </div>
          <span className="text-xs th-text-hint">提示：按 ⌘ K 可跳转到任意位置</span>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto">
          {projects.slice(0, 6).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => navigate(`/projects/${p.id}`)}
                className="flex w-full items-center gap-3 border-b border-[var(--th-divider)] px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--th-sf-03)]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--th-sf-05)]">
                  <Folder className="h-[15px] w-[15px] th-text-strong" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm th-text-strong">{p.name}</span>
                  <span className="truncate text-xs th-text-muted">
                    {p.repository} · {p.branch}
                  </span>
                </span>
                <span className="shrink-0 text-xs th-text-muted">
                  {p.deploymentCount} 次部署
                </span>
                <span
                  className="shrink-0 text-xs"
                  style={{ color: STATUS_COLOR[p.status] }}
                >
                  {STATUS_LABEL[p.status]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
