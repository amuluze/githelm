import type { ServerDirEntry } from "@githelm/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowUp,
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  HardDrive,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "../components/domain/PageHeader";
import { api, ApiError } from "../lib/api";

/** files page: SFTP transfers against a picked server. */

/** Mirrors the backend's join: trims the dir's trailing slash. */
function joinRemote(dir: string, name: string) {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

function parentOf(p: string) {
  if (p === "~" || p === "/")
    return null;
  const cut = p.replace(/\/+$/, "").lastIndexOf("/");
  if (cut <= 0)
    return p.startsWith("/") ? "/" : null;
  return p.slice(0, cut);
}

export function FilesPage() {
  const queryClient = useQueryClient();
  const servers = useQuery({ queryKey: ["servers"], queryFn: api.listServers });
  /** Empty until the user picks one; defaults to the first server. */
  const [serverId, setServerId] = useState("");
  const activeServerId = serverId || servers.data?.[0]?.id || "";

  const [path, setPath] = useState("~");
  const [pathInput, setPathInput] = useState("~");
  const [dragOver, setDragOver] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ServerDirEntry | null>(null);

  const listing = useQuery({
    queryKey: ["server-dir", activeServerId, path],
    queryFn: () => api.listServerDir(activeServerId, path),
    enabled: Boolean(activeServerId),
  });
  const entries = listing.data?.entries ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["server-dir", activeServerId] });
  };

  const upload = useMutation({
    mutationFn: (localPaths: string[]) =>
      api.sftpUpload(activeServerId, path, localPaths),
    onSuccess: (r) => {
      toast.success(`已上传 ${r.transferred} 项`);
      invalidate();
    },
    onError: err =>
      toast.error(err instanceof ApiError ? err.message : "上传失败"),
  });

  const download = useMutation({
    mutationFn: async (entry: ServerDirEntry) => {
      let picked: unknown;
      try {
        picked = await open({ directory: true, multiple: false });
      }
      catch {
        return null;
      }
      if (typeof picked !== "string" || !picked)
        return null;
      await api.sftpDownload(activeServerId, joinRemote(path, entry.name), picked);
      return picked;
    },
    onSuccess: (dir) => {
      if (dir)
        toast.success(`已下载到 ${dir}`);
    },
    onError: err =>
      toast.error(err instanceof ApiError ? err.message : "下载失败"),
  });

  const mkdir = useMutation({
    mutationFn: (name: string) => api.sftpMkdir(activeServerId, path, name),
    onSuccess: () => {
      setNewFolderOpen(false);
      toast.success("文件夹已创建");
      invalidate();
    },
    onError: err =>
      toast.error(err instanceof ApiError ? err.message : "创建文件夹失败"),
  });

  const remove = useMutation({
    mutationFn: (entry: ServerDirEntry) =>
      api.sftpDelete(activeServerId, joinRemote(path, entry.name), entry.isDir),
    onSuccess: () => {
      setPendingDelete(null);
      toast.success("已删除");
      invalidate();
    },
    onError: err =>
      toast.error(err instanceof ApiError ? err.message : "删除失败"),
  });

  const busy
    = upload.isPending || download.isPending || mkdir.isPending || remove.isPending;

  /** Latest upload entry point for the mount-once drag-drop listener. */
  const uploadRef = useRef<(paths: string[]) => void>(() => {});
  useEffect(() => {
    uploadRef.current = (paths) => {
      if (activeServerId && !busy)
        upload.mutate(paths);
    };
  });

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window))
      return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        setDragOver(true);
      }
      else {
        setDragOver(false);
        if (event.payload.type === "drop" && event.payload.paths.length > 0)
          uploadRef.current(event.payload.paths);
      }
    }).then((off) => {
      if (alive)
        unlisten = off;
      else
        off();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  const pickAndUpload = async () => {
    let picked: unknown;
    try {
      picked = await open({ multiple: true });
    }
    catch {
      return;
    }
    const paths = Array.isArray(picked)
      ? picked.filter((p): p is string => typeof p === "string")
      : typeof picked === "string" && picked ? [picked] : [];
    if (paths.length > 0)
      upload.mutate(paths);
  };

  const navigate = (next: string) => {
    setPath(next);
    setPathInput(next);
  };

  const parent = parentOf(path);

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title="文件"
          description="通过 SFTP 在本机与服务器之间传输文件资料"
          actions={(
            <button
              type="button"
              className="th-btn th-btn-primary"
              disabled={!activeServerId || busy}
              onClick={() => void pickAndUpload()}
            >
              {upload.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Upload className="h-3.5 w-3.5" />}
              上传
            </button>
          )}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-8 pb-8 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex h-9 items-center">
            <HardDrive className="pointer-events-none absolute left-3 h-3.5 w-3.5 th-text-secondary" />
            <select
              value={activeServerId}
              onChange={e => setServerId(e.target.value)}
              className="h-full appearance-none rounded-[10px] border th-bd-default th-bg-card pl-[34px] pr-8 text-[13px] th-text-strong outline-none"
            >
              {servers.data?.length === 0 && <option value="">未添加服务器</option>}
              {(servers.data ?? []).map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  （
                  {s.username ? `${s.username}@` : ""}
                  {s.host}
                  ）
                </option>
              ))}
            </select>
          </div>

          <div className="flex h-9 min-w-[240px] flex-1 items-center rounded-[10px] border th-bd-default th-bg-card px-3">
            <input
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  navigate(pathInput.trim() || "~");
              }}
              placeholder="远程目录，如 /srv/my-app"
              spellCheck={false}
              className="w-full bg-transparent font-mono text-[13px] outline-none placeholder:th-text-muted"
            />
          </div>

          <div className="flex items-center gap-2">
            {busy && (
              <span className="flex items-center gap-1.5 text-xs th-text-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                传输中…
              </span>
            )}
            <button
              type="button"
              disabled={!parent}
              title={parent ? "返回上级目录" : "已是顶层目录"}
              onClick={() => parent && navigate(parent)}
              className="th-btn th-btn-soft px-2.5 disabled:cursor-default disabled:opacity-50"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="刷新"
              disabled={!activeServerId}
              onClick={() => void listing.refetch()}
              className="th-btn th-btn-soft px-2.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!activeServerId || busy}
              onClick={() => setNewFolderOpen(true)}
              className="th-btn th-btn-soft px-2.5"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1">
          <section className="th-card flex min-h-0 flex-1 flex-col overflow-auto">
            {!activeServerId
              ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                    <p className="text-sm th-text-muted">还没有可用的服务器。</p>
                    <Link to="/servers" className="th-link text-xs">
                      前往服务器页添加 →
                    </Link>
                  </div>
                )
              : listing.isLoading
                ? (
                    <div className="flex flex-1 items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin th-text-muted" />
                    </div>
                  )
                : listing.isError
                  ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                        <p className="text-sm th-text-muted">
                          目录读取失败：
                          {listing.error instanceof ApiError
                            ? listing.error.message
                            : "未知错误"}
                        </p>
                        <button
                          type="button"
                          onClick={() => void listing.refetch()}
                          className="th-btn th-btn-soft px-3.5"
                        >
                          重试
                        </button>
                      </div>
                    )
                  : entries.length === 0
                    ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                          <Folder className="h-8 w-8 th-text-hint" />
                          <p className="text-sm th-text-muted">空目录</p>
                          <p className="max-w-[360px] text-xs th-text-hint">
                            把文件拖进窗口即可上传到当前目录，或点击右上角「上传」选择文件。
                          </p>
                        </div>
                      )
                    : (
                        entries.map(entry => (
                          <EntryRow
                            key={entry.name}
                            entry={entry}
                            busy={busy}
                            onEnter={navigate}
                            onDownload={e => download.mutate(e)}
                            onDelete={setPendingDelete}
                          />
                        ))
                      )}
          </section>

          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--th-accent)] bg-[color-mix(in_srgb,var(--th-accent)_10%,transparent)]">
              <p className="text-sm font-medium th-text-strong">
                松开上传到当前目录
              </p>
            </div>
          )}
        </div>
      </div>

      {newFolderOpen && (
        <NewFolderDialog
          parentDir={path}
          creating={mkdir.isPending}
          onClose={() => setNewFolderOpen(false)}
          onCreate={name => mkdir.mutate(name)}
        />
      )}

      {pendingDelete && (
        <ConfirmDeleteDialog
          entry={pendingDelete}
          deleting={remove.isPending}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => remove.mutate(pendingDelete)}
        />
      )}
    </div>
  );
}

function EntryRow({
  entry,
  busy,
  onEnter,
  onDownload,
  onDelete,
}: {
  entry: ServerDirEntry;
  busy: boolean;
  onEnter: (path: string) => void;
  onDownload: (entry: ServerDirEntry) => void;
  onDelete: (entry: ServerDirEntry) => void;
}) {
  return (
    <div
      role={entry.isDir ? "button" : undefined}
      tabIndex={entry.isDir ? 0 : undefined}
      onClick={entry.isDir ? () => onEnter(entry.name) : undefined}
      onKeyDown={(e) => {
        if (entry.isDir && e.key === "Enter")
          onEnter(entry.name);
      }}
      className={
        `group flex w-full items-center gap-3 border-b border-[var(--th-divider)] px-5 py-2.5 last:border-b-0 hover:bg-[var(--th-sf-03)]${
          entry.isDir ? " cursor-pointer" : ""}`
      }
    >
      {entry.isDir
        ? (
            <Folder className="h-4 w-4 shrink-0 text-[var(--th-warning-fg)]" />
          )
        : (
            <FileIcon className="h-4 w-4 shrink-0 th-text-hint" />
          )}
      <span className="min-w-0 flex-1 truncate text-left text-sm th-text-strong">
        {entry.name}
      </span>
      <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          disabled={busy}
          title={`下载 ${entry.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDownload(entry);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md th-text-secondary hover:bg-[var(--th-sf-06)] hover:th-text-strong disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={busy}
          title={entry.isDir ? `删除空文件夹 ${entry.name}` : `删除 ${entry.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entry);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md th-text-secondary hover:bg-[var(--th-sf-06)] hover:th-text-strong disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

function NewFolderDialog({
  parentDir,
  creating,
  onClose,
  onCreate,
}: {
  parentDir: string;
  creating: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim())
      onCreate(name.trim());
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal
    >
      <form onSubmit={submit} className="th-card w-full max-w-sm p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold th-text-title">新建文件夹</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--th-sf-06)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-2 text-xs th-text-muted">
          将在
          {" "}
          <code className="font-mono">{parentDir}</code>
          {" "}
          下创建。
        </p>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="文件夹名称"
          autoFocus
          className="th-input"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="th-btn th-btn-soft px-3.5">
            取消
          </button>
          <button type="submit" disabled={creating || !name.trim()} className="th-btn th-btn-primary px-4">
            {creating ? "创建中…" : "创建"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDeleteDialog({
  entry,
  deleting,
  onClose,
  onConfirm,
}: {
  entry: ServerDirEntry;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal
    >
      <div className="th-card w-full max-w-sm p-5 shadow-xl">
        <h2 className="text-base font-semibold th-text-title">
          {entry.isDir ? "删除文件夹" : "删除文件"}
        </h2>
        <p className="mt-2 text-[13px] leading-[1.6] th-text-secondary">
          将删除服务器上的
          {" "}
          <code className="font-mono">{entry.name}</code>
          {entry.isDir
            ? "。文件夹必须为空（应用不提供递归删除，如需清空请使用终端）。"
            : "。此操作不可撤销。"}
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
}
