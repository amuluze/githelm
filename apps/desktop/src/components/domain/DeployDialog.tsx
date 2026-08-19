import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUp,
  File as FileIcon,
  Folder,
  FolderOpen,
  Loader2,
  Rocket,
  Terminal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Deployment, Project } from "@githelm/core";
import { api, ApiError } from "../../lib/api";

/** Taskfile-style convention (see the amuluze workflow): the local command
 *  builds and pushes the image; the remote command refreshes the service. */
const DEFAULT_BUILD_COMMAND = "task push";
const DEFAULT_UPDATE_COMMAND = "docker compose pull && docker compose up -d";

interface DeployConfigForm {
  localPath: string;
  serverId: string;
  deployDir: string;
  buildCommand: string;
  updateCommand: string;
}

const configOf = (p: Project): DeployConfigForm => ({
  localPath: p.localPath ?? "",
  serverId: p.serverId ?? "",
  deployDir: p.deployDir ?? "",
  buildCommand: p.buildCommand ?? DEFAULT_BUILD_COMMAND,
  updateCommand: p.updateCommand ?? DEFAULT_UPDATE_COMMAND,
});

export interface DeployDialogProps {
  project: Project;
  onClose: () => void;
  onStarted: (deployment: Deployment) => void;
}

/** Configure (or review) a project's deploy pipeline, then start it. */
export const DeployDialog = ({ project, onClose, onStarted }: DeployDialogProps) => {
  const servers = useQuery({ queryKey: ["servers"], queryFn: api.listServers });
  const [form, setForm] = useState<DeployConfigForm>(() => configOf(project));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [browsing, setBrowsing] = useState(false);

  const start = useMutation({
    mutationFn: async () => {
      const saved = await api.updateProjectConfig({
        projectId: project.id,
        localPath: form.localPath,
        serverId: form.serverId,
        deployDir: form.deployDir,
        buildCommand: form.buildCommand,
        updateCommand: form.updateCommand,
      });
      return api.deployProject(saved.id);
    },
    onSuccess: (dep) => {
      toast.success("部署已启动");
      onStarted(dep);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "启动部署失败"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors: Record<string, string> = {};
    if (!form.localPath.trim()) fieldErrors.localPath = "本地路径不能为空";
    if (!form.serverId) fieldErrors.serverId = "请选择目标服务器";
    if (!form.deployDir.trim()) fieldErrors.deployDir = "部署目录不能为空";
    if (!form.buildCommand.trim()) fieldErrors.buildCommand = "构建命令不能为空";
    if (!form.updateCommand.trim()) fieldErrors.updateCommand = "更新命令不能为空";
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    start.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal
    >
      <form onSubmit={submit} className="th-card w-full max-w-lg p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold th-text-title">部署项目</h2>
            <span className="rounded-md bg-[var(--th-on-05)] px-1.5 py-px text-[11px] th-text-muted">
              {project.repository}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--th-sf-06)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 rounded-lg bg-[var(--th-sf-03)] px-3 py-2 text-[11px] leading-relaxed th-text-secondary">
          流程：在本地路径执行「构建命令」推送镜像，随后 SSH
          到目标服务器，在部署目录执行「更新命令」。
        </p>

        {servers.data?.length === 0 && (
          <p className="mb-3 rounded-lg bg-[var(--th-warning-bg)] px-3 py-2 text-xs text-[var(--th-warning-fg)]">
            尚未添加服务器 —— 请先前往
            <Link to="/servers" className="th-link">
              服务器页
            </Link>
            添加。
          </p>
        )}

        <div className="space-y-3">
          <Field label="本地路径（含 Dockerfile / Taskfile 的目录）" error={errors.localPath}>
            <input
              value={form.localPath}
              onChange={(e) => setForm({ ...form, localPath: e.target.value })}
              placeholder="/Users/you/projects/my-app"
              className="th-input font-mono text-[13px]"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="目标服务器" error={errors.serverId}>
              <select
                value={form.serverId}
                onChange={(e) => setForm({ ...form, serverId: e.target.value })}
                className="th-input"
              >
                <option value="">选择服务器…</option>
                {(servers.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.username ? `${s.username}@` : ""}
                    {s.host}）
                  </option>
                ))}
              </select>
            </Field>
            <Field label="部署目录（服务器上）" error={errors.deployDir}>
              <div className="flex gap-1.5">
                <input
                  value={form.deployDir}
                  onChange={(e) => setForm({ ...form, deployDir: e.target.value })}
                  placeholder="/srv/my-app"
                  className="th-input font-mono text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => setBrowsing(true)}
                  disabled={!form.serverId}
                  title={
                    form.serverId
                      ? "浏览服务器目录"
                      : "请先选择目标服务器"
                  }
                  className="th-btn th-btn-soft shrink-0 px-2.5"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </button>
              </div>
            </Field>
          </div>

          <Field label="构建命令（本地，构建并推送镜像）" error={errors.buildCommand}>
            <input
              value={form.buildCommand}
              onChange={(e) => setForm({ ...form, buildCommand: e.target.value })}
              placeholder={DEFAULT_BUILD_COMMAND}
              className="th-input font-mono text-[13px]"
            />
          </Field>

          <Field label="更新命令（远程，在部署目录执行）" error={errors.updateCommand}>
            <input
              value={form.updateCommand}
              onChange={(e) => setForm({ ...form, updateCommand: e.target.value })}
              placeholder={DEFAULT_UPDATE_COMMAND}
              className="th-input font-mono text-[13px]"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="th-btn th-btn-soft px-3.5">
            取消
          </button>
          <button
            type="submit"
            disabled={start.isPending}
            className="th-btn th-btn-primary px-4"
          >
            {start.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            {start.isPending ? "启动中…" : "保存并部署"}
          </button>
        </div>
      </form>

      {browsing && form.serverId && (
        <ServerDirPicker
          serverId={form.serverId}
          initialPath={form.deployDir || "~"}
          onPick={(path) => {
            setForm((f) => ({ ...f, deployDir: path }));
            setBrowsing(false);
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </div>
  );
};

/** Walks the server's filesystem over SSH to choose the deploy dir. */
const ServerDirPicker = ({
  serverId,
  initialPath,
  onPick,
  onClose,
}: {
  serverId: string;
  initialPath: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) => {
  const [path, setPath] = useState(initialPath);

  const listing = useQuery({
    queryKey: ["server-dir", serverId, path],
    queryFn: () => api.listServerDir(serverId, path),
  });

  const parentOf = (p: string) => {
    if (p === "~" || p === "/") return null;
    const cut = p.replace(/\/+$/, "").lastIndexOf("/");
    if (cut <= 0) return p.startsWith("/") ? "/" : null;
    return p.slice(0, cut);
  };
  const parent = parentOf(path);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="th-card flex max-h-[70vh] w-full max-w-md flex-col p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Folder className="h-4 w-4 shrink-0 th-text-secondary" />
            <span className="truncate font-mono text-[13px] th-text-strong">
              {path}
            </span>
            {listing.isFetching && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin th-text-muted" />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-[var(--th-sf-06)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="th-bg-inset min-h-[200px] flex-1 overflow-y-auto rounded-xl">
          {listing.isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="text-xs text-[var(--th-danger-fg)]">
                {listing.error instanceof ApiError
                  ? listing.error.message
                  : "目录读取失败"}
              </p>
              <button
                type="button"
                onClick={() => void listing.refetch()}
                className="th-btn th-btn-soft px-3 py-1.5 text-xs"
              >
                重试
              </button>
            </div>
          ) : listing.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin th-text-muted" />
            </div>
          ) : (
            <>
              {parent && (
                <button
                  type="button"
                  onClick={() => setPath(parent)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] th-text-secondary transition-colors hover:bg-[var(--th-sf-03)]"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  ..
                </button>
              )}
              {(listing.data?.entries ?? []).map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  disabled={!entry.isDir}
                  onClick={() =>
                    entry.isDir &&
                    setPath(`${path.replace(/\/+$/, "")}/${entry.name}`)
                  }
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--th-sf-03)] disabled:cursor-default disabled:hover:bg-transparent"
                >
                  {entry.isDir ? (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--th-warning-fg)]" />
                  ) : (
                    <FileIcon className="h-3.5 w-3.5 shrink-0 th-text-hint" />
                  )}
                  <span
                    className={
                      entry.isDir ? "th-text-strong truncate" : "th-text-muted truncate"
                    }
                  >
                    {entry.name}
                  </span>
                </button>
              ))}
              {(listing.data?.entries ?? []).length === 0 && !parent && (
                <p className="p-4 text-center text-xs th-text-muted">空目录</p>
              )}
            </>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] th-text-hint">浏览到目标目录后选择它</p>
          <button
            type="button"
            onClick={() => onPick(listing.data?.path ?? path)}
            className="th-btn th-btn-primary px-3.5"
          >
            <Terminal className="h-3.5 w-3.5" />
            选择此目录
          </button>
        </div>
      </div>
    </div>
  );
};

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
