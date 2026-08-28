import { useQuery } from "@tanstack/react-query";
import {
  EllipsisVertical,
  Eye,
  GitBranch,
  Globe,
  Plus,
  RotateCcw,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WindowIllustration } from "../components/domain/Illustrations";
import { PageHeader } from "../components/domain/PageHeader";
import { ProjectCard } from "../components/domain/ProjectCard";
import { api } from "../lib/api";

/** projects-mock in githelm.pen. */

const FEATURES = [
  { icon: Zap, title: "即时", sub: "数秒内完成部署" },
  { icon: Globe, title: "全球", sub: "100+ 边缘节点区域" },
  { icon: Eye, title: "预览", sub: "每个分支独立 URL" },
  { icon: RotateCcw, title: "回滚", sub: "一键还原" },
];

export function ProjectsPage() {
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const list = projects.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title="项目"
          description={`${list.length} 个项目`}
          actions={(
            <>
              <button
                type="button"
                onClick={() => navigate("/library")}
                className="th-btn th-btn-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                创建项目
              </button>
              <button
                type="button"
                aria-label="更多操作"
                className="flex h-8 w-8 items-center justify-center rounded-lg th-text-secondary transition-colors hover:bg-[var(--th-sf-05)] hover:th-text-strong"
              >
                <EllipsisVertical className="h-4 w-4" />
              </button>
            </>
          )}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-8 pb-8 pt-5">
        {projects.isLoading
          ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {["a", "b", "c"].map(id => (
                  <div
                    key={id}
                    className="h-40 animate-pulse rounded-2xl border th-bd-divider bg-[var(--th-sf-03)]"
                  />
                ))}
              </div>
            )
          : list.length === 0
            ? (
                <ProjectsEmpty />
              )
            : (
                <div className="grid flex-1 content-start grid-cols-1 gap-4 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
                  {list.map(p => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              )}
      </div>
    </div>
  );
}

function ProjectsEmpty() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 overflow-y-auto">
      <WindowIllustration />
      <h2 className="text-lg th-text-strong">开始你的第一个项目</h2>
      <p className="max-w-[420px] text-center text-[13px] leading-[1.5] th-text-secondary">
        导入 Git 仓库、使用模板，或从 CLI 部署。你的项目将显示在这里。
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/library")}
          className="th-btn th-btn-primary px-[18px] py-2.5"
        >
          <Plus className="h-3.5 w-3.5" />
          创建项目
        </button>
        <button type="button" className="th-btn th-btn-soft px-[18px] py-2.5">
          <GitBranch className="h-3.5 w-3.5" />
          浏览模板
        </button>
      </div>
      <span className="text-xs th-text-muted">零配置部署</span>
      <div className="flex gap-4">
        {FEATURES.map(f => (
          <div
            key={f.title}
            className="th-card flex w-[196px] flex-col gap-1.5 rounded-xl p-4"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--th-sf-05)]">
              <f.icon className="h-4 w-4 th-text-strong" />
            </span>
            <span className="text-sm th-text-strong">{f.title}</span>
            <span className="text-xs th-text-muted">{f.sub}</span>
          </div>
        ))}
      </div>
      <span className="text-xs th-text-hint">或按 ⌘ K 打开命令面板</span>
    </div>
  );
}
