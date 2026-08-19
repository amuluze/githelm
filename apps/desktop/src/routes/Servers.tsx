import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ExternalLink, Plus, Server, X } from "lucide-react";
import { toast } from "sonner";
import type { AddServerInput, Server as ServerModel, UpdateServerInput } from "@githelm/core";
import { addServerSchema, updateServerSchema } from "@githelm/core";
import { api, ApiError } from "../lib/api";
import { PageHeader } from "../components/domain/PageHeader";
import { ServerRow } from "../components/domain/ServerRow";
import { ServerStackIllustration } from "../components/domain/Illustrations";

/** servers-mock in githelm.pen. */

export const ServersPage = () => {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ServerModel | null>(null);

  const servers = useQuery({ queryKey: ["servers"], queryFn: api.listServers });

  const remove = useMutation({
    mutationFn: api.removeServer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast.success("服务器已移除");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "移除服务器失败"),
  });

  const edited = useMutation({
    mutationFn: api.updateServer,
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast.success("服务器已更新");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "更新服务器失败"),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title="服务器"
          description="管理你的部署服务器和基础设施"
          actions={
            <button
              type="button"
              onClick={() => setShowDialog(true)}
              className="th-btn th-btn-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              添加服务器
            </button>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-8 pb-8 pt-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 border-b-2 border-[var(--th-accent)] px-3 py-2 text-[13px] th-text-strong"
          >
            <Server className="h-[15px] w-[15px]" />
            服务器
          </button>
        </div>

        {servers.isLoading ? (
          <section className="th-card flex flex-1 items-center justify-center">
            <div className="text-sm th-text-muted">加载中…</div>
          </section>
        ) : (servers.data ?? []).length === 0 ? (
          <ServersEmpty onAdd={() => setShowDialog(true)} />
        ) : (
          <section className="th-card min-h-0 flex-1 overflow-auto">
            {(servers.data ?? []).map((s) => (
              <ServerRow
                key={s.id}
                server={s}
                onRemove={(id) => remove.mutate(id)}
                onEdit={(server) => setEditing(server)}
              />
            ))}
          </section>
        )}
      </div>

      {showDialog && (
        <AddServerDialog
          onClose={() => setShowDialog(false)}
          onAdded={() => {
            setShowDialog(false);
            void queryClient.invalidateQueries({ queryKey: ["servers"] });
            toast.success("服务器已添加");
          }}
        />
      )}

      {editing && (
        <EditServerDialog
          server={editing}
          onClose={() => setEditing(null)}
          onSaved={(input) => edited.mutate(input)}
        />
      )}
    </div>
  );
};

/** Edits connection details — the fix for "SSH 连接失败" with stale
 *  username/port/host. Credential blank keeps the stored keychain entry. */
const EditServerDialog = ({
  server,
  onClose,
  onSaved,
}: {
  server: ServerModel;
  onClose: () => void;
  onSaved: (input: UpdateServerInput) => void;
}) => {
  const [form, setForm] = useState<UpdateServerInput>({
    id: server.id,
    name: server.name,
    host: server.host,
    kind: server.kind,
    region: server.region ?? "",
    username: server.username ?? "root",
    port: server.port,
    credential: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = updateServerSchema.safeParse(form);
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
          <h2 className="text-base font-semibold th-text-title">编辑服务器</h2>
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

          <Field label="主机" error={errors.host}>
            <input
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder="203.0.113.42 或 host.example.com"
              className="th-input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="用户名" error={errors.username}>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="th-input"
              />
            </Field>
            <Field label="SSH 端口" error={errors.port}>
              <input
                type="number"
                value={form.port}
                onChange={(e) =>
                  setForm({ ...form, port: Number(e.target.value) || 22 })
                }
                className="th-input"
              />
            </Field>
          </div>

          <Field label="凭据（留空则保留已保存的）" error={errors.credential}>
            <input
              type="password"
              value={form.credential ?? ""}
              onChange={(e) =>
                setForm({ ...form, credential: e.target.value })
              }
              placeholder="不修改请留空"
              className="th-input"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="th-btn th-btn-soft px-3.5">
            取消
          </button>
          <button type="submit" className="th-btn th-btn-primary px-4">
            保存
          </button>
        </div>
      </form>
    </div>
  );
};

const ServersEmpty = ({ onAdd }: { onAdd: () => void }) => (
  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 overflow-y-auto">
    <ServerStackIllustration />
    <h2 className="text-lg th-text-strong">还没有服务器</h2>
    <p className="max-w-[440px] text-center text-[13px] leading-[1.6] th-text-secondary">
      通过 SSH 连接一台服务器，其余的交给 Githelm 处理 —— Docker、OpenResty、SSL
      和部署都会自动配置好。
    </p>
    <div className="flex items-center gap-3">
      <button type="button" onClick={onAdd} className="th-btn th-btn-primary px-[18px] py-2.5">
        <Plus className="h-3.5 w-3.5" />
        添加你的第一台服务器
      </button>
      <button type="button" className="th-btn th-btn-soft px-[18px] py-2.5">
        <BookOpen className="h-3.5 w-3.5" />
        See docs
        <ExternalLink className="h-3 w-3 th-text-muted" />
      </button>
    </div>
  </div>
);

interface AddServerDialogProps {
  onClose: () => void;
  onAdded: () => void;
}

const AddServerDialog = ({ onClose, onAdded }: AddServerDialogProps) => {
  const [form, setForm] = useState<AddServerInput>({
    name: "",
    host: "",
    kind: "ssh",
    region: "",
    username: "root",
    credential: "",
    port: 22,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const add = useMutation({
    mutationFn: api.addServer,
    onSuccess: () => onAdded(),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "添加服务器失败"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = addServerSchema.safeParse(form);
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
    add.mutate(parsed.data);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal
    >
      <form onSubmit={submit} className="th-card w-full max-w-md p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold th-text-title">添加服务器</h2>
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
              placeholder="production-us-east"
              className="th-input"
            />
          </Field>

          <Field label="主机" error={errors.host}>
            <input
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder="203.0.113.42 或 host.example.com"
              className="th-input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="类型" error={errors.kind}>
              <select
                value={form.kind}
                onChange={(e) =>
                  setForm({ ...form, kind: e.target.value as "ssh" | "cloud" })
                }
                className="th-input"
              >
                <option value="ssh">SSH</option>
                <option value="cloud">云端</option>
              </select>
            </Field>
            <Field label="区域" error={errors.region}>
              <input
                value={form.region ?? ""}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="us-east-1"
                disabled={form.kind !== "cloud"}
                className="th-input disabled:opacity-50"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="用户名" error={errors.username}>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="th-input"
              />
            </Field>
            <Field label="SSH 端口" error={errors.port}>
              <input
                type="number"
                value={form.port}
                onChange={(e) =>
                  setForm({ ...form, port: Number(e.target.value) || 22 })
                }
                className="th-input"
              />
            </Field>
          </div>

          <Field label="凭据(密钥或密码)" error={errors.credential}>
            <input
              type="password"
              value={form.credential}
              onChange={(e) =>
                setForm({ ...form, credential: e.target.value })
              }
              placeholder="将存入系统钥匙串"
              className="th-input"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="th-btn th-btn-soft px-3.5">
            取消
          </button>
          <button type="submit" disabled={add.isPending} className="th-btn th-btn-primary px-4">
            {add.isPending ? "添加中…" : "添加服务器"}
          </button>
        </div>
      </form>
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
