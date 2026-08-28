import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  Github,
  Pencil,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusDot,
} from "@githelm/ui";
import { formatDuration, updateProjectSchema } from "@githelm/core";
import type { Project, UpdateProjectInput } from "@githelm/core";
import { api, ApiError } from "../lib/api";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deployOpen, setDeployOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const saveEdit = useMutation({
    mutationFn: (input: UpdateProjectInput) => api.updateProject(input),
    onSuccess: () => {
      setEditOpen(false);
      invalidateProject();
      toast.success("项目已更新");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "更新项目失败"),
  });

  const removeProject = useMutation({
    mutationFn: () => api.deleteProject(id!),
    onSuccess: () => {
      toast.success("项目已删除");
      navigate("/projects");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "删除项目失败"),
  });

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
                className="th-btn th-btn-secondary px-3.5"
                disabled={p.status === "building"}
                title={p.status === "building" ? "部署进行中，暂不可编辑" : undefined}
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
              <button
                type="button"
                className="th-btn th-btn-secondary px-3"
                disabled={p.status === "building"}
                title={p.status === "building" ? "部署进行中，暂不可删除" : undefined}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
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

      {editOpen && (
        <EditProjectDialog
          project={p}
          onClose={() => setEditOpen(false)}
          onSaved={(input) => saveEdit.mutate(input)}
          saving={saveEdit.isPending}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          project={p}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => removeProject.mutate()}
          deleting={removeProject.isPending}
        />
      )}
    </div>
  );
};

/** Edits display fields — name (slug follows), branch and public URL. The
 *  repository binding is immutable. */
const EditProjectDialog = ({
  project,
  onClose,
  onSaved,
  saving,
}: {
  project: Project;
  onClose: () => void;
  onSaved: (input: UpdateProjectInput) => void;
  saving: boolean;
}) => {
  const [form, setForm] = useState<UpdateProjectInput>({
    projectId: project.id,
    name: project.name,
    branch: project.branch,
    url: project.url ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = updateProjectSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSaved(parsed.data);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal
    >
      <form onSubmit={submit} className="th-card w-full max-w-md p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold th-text-title">编辑项目</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--th-sf-06)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="名称" error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="th-input"
            />
          </Field>
          <Field label="分支" error={errors.branch}>
            <input
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              className="th-input"
            />
          </Field>
          <Field label="访问 URL（可选）" error={errors.url}>
            <input
              value={form.url ?? ""}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://app.example.com"
              className="th-input"
            />
          </Field>
          <p className="text-xs th-text-muted">
            仓库 <code className="font-mono">{project.repository}</code>{" "}
            不可修改 —— 它标识这个导入的项目。
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="th-btn th-btn-soft px-3.5">
            取消
          </button>
          <button type="submit" disabled={saving} className="th-btn th-btn-primary px-4">
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
};

const ConfirmDeleteDialog = ({
  project,
  onClose,
  onConfirm,
  deleting,
}: {
  project: Project;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    role="dialog"
    aria-modal
  >
    <div className="th-card w-full max-w-sm p-5 shadow-xl">
      <h2 className="text-base font-semibold th-text-title">删除项目</h2>
      <p className="mt-2 text-[13px] leading-[1.6] th-text-secondary">
        将删除「{project.name}」及其全部部署记录与日志。服务器配置会保留。
        此操作不可撤销。
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="th-btn th-btn-soft px-3.5">
          取消
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={onConfirm}
          className="th-btn px-4 text-[var(--th-danger-fg)]"
          style={{ backgroundColor: "var(--th-danger-bg)" }}
        >
          {deleting ? "删除中…" : "确认删除"}
        </button>
      </div>
    </div>
  </div>
);

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium th-text-muted">{label}</span>
    {children}
    {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
  </label>
);
