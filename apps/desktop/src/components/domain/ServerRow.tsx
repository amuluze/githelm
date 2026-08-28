import type { ServerKind, Server as ServerModel, ServerStatus } from "@githelm/core";
import { formatRelativeTime } from "@githelm/core";
import { Badge, StatusDot } from "@githelm/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Cloud,
  Loader2,
  Pencil,
  Server as ServerIcon,
  SquareTerminal,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useNow } from "../../hooks/useNow";
import { api, ApiError } from "../../lib/api";

const KIND_ICON: Record<ServerKind, React.ComponentType<{ className?: string }>> = {
  ssh: Terminal,
  cloud: Cloud,
};

const STATUS_VARIANT: Record<
  ServerStatus,
  "success" | "muted" | "warning" | "danger"
> = {
  online: "success",
  offline: "muted",
  connecting: "warning",
  error: "danger",
};

const STATUS_LABEL: Record<ServerStatus, string> = {
  online: "在线",
  offline: "离线",
  connecting: "连接中",
  error: "错误",
};

export interface ServerRowProps {
  server: ServerModel;
  onRemove?: (id: string) => void;
  /** Opens the edit dialog — fixes connection details (user/host/port). */
  onEdit?: (server: ServerModel) => void;
}

export function ServerRow({ server, onRemove, onEdit }: ServerRowProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const Icon = KIND_ICON[server.kind];

  const [latency, setLatency] = useState<number | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useNow();

  useEffect(() => () => {
    if (confirmTimerRef.current)
      clearTimeout(confirmTimerRef.current);
  }, []);

  const test = useMutation({
    mutationFn: () => api.testServerConnection(server.id),
    onSuccess: (result) => {
      setLatency(result.latencyMs);
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (err) => {
      setLatency(null);
      toast.error(err instanceof ApiError ? err.message : "连接测试失败");
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
  });

  const remove = () => {
    if (!onRemove)
      return;
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      confirmTimerRef.current = setTimeout(setConfirmingRemove, 3000, false);
      return;
    }
    if (confirmTimerRef.current)
      clearTimeout(confirmTimerRef.current);
    setConfirmingRemove(false);
    onRemove(server.id);
  };

  return (
    <div className="flex items-center gap-3 border-b border-[var(--th-divider)] px-5 py-3 last:border-b-0 hover:bg-[var(--th-sf-03)]">
      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--th-sf-05)]">
        {server.kind === "cloud"
          ? (
              <Cloud className="h-4 w-4 th-text-strong" />
            )
          : (
              <ServerIcon className="h-4 w-4 th-text-strong" />
            )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium th-text-strong">{server.name}</span>
          <Badge variant="muted" className="gap-1">
            <Icon className="h-3 w-3" />
            {server.kind === "ssh" ? "SSH" : server.region ?? "云端"}
          </Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs th-text-muted">
          <span className="truncate font-mono">
            {server.username ? `${server.username}@` : ""}
            {server.host}
            {server.port !== 22 ? `:${server.port}` : ""}
          </span>
          <span aria-hidden>·</span>
          <span>
            最后活跃
            {formatRelativeTime(server.lastSeenAt, now, "zh")}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {latency !== null && !test.isPending && (
          <span className="text-xs text-[var(--th-success-fg)]">
            {latency}
            ms
          </span>
        )}
        <Badge variant={STATUS_VARIANT[server.status]} className="gap-1.5">
          <StatusDot
            status={
              server.status === "online"
                ? "running"
                : server.status === "offline"
                  ? "stopped"
                  : server.status === "connecting"
                    ? "pending"
                    : "error"
            }
          />
          {STATUS_LABEL[server.status]}
        </Badge>

        <button
          type="button"
          onClick={() => navigate(`/terminal/${server.id}`)}
          title={`打开 ${server.name} 的 SSH 终端`}
          aria-label={`打开 ${server.name} 的终端`}
          className="th-text-muted flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--th-sf-04)] hover:th-text-strong"
        >
          <SquareTerminal className="h-3.5 w-3.5" />
        </button>

        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(server)}
            title="编辑服务器"
            aria-label={`编辑 ${server.name}`}
            className="th-text-muted flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--th-sf-04)] hover:th-text-strong"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            test.mutate();
          }}
          disabled={test.isPending}
          title="测试 SSH 连接"
          aria-label={`测试 ${server.name} 连接`}
          className="th-text-muted flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--th-sf-04)] hover:th-text-strong disabled:opacity-60"
        >
          {test.isPending
            ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )
            : (
                <Activity className="h-3.5 w-3.5" />
              )}
        </button>

        {onRemove && (
          <button
            type="button"
            onClick={remove}
            className={
              confirmingRemove
                ? "flex h-7 items-center justify-center rounded-md bg-red-500/15 px-2 text-xs font-medium text-red-600"
                : "th-text-muted flex h-7 w-7 items-center justify-center rounded-md hover:bg-red-500/10 hover:text-red-600"
            }
            aria-label={confirmingRemove ? "确认移除" : `移除 ${server.name}`}
          >
            {confirmingRemove
              ? (
                  "确认"
                )
              : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
          </button>
        )}
      </div>
    </div>
  );
}
