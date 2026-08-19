import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Terminal, X } from "lucide-react";
import type { Deployment } from "@githelm/core";
import { formatDuration } from "@githelm/core";
import { api } from "../../lib/api";

const STATUS_LABEL: Record<Deployment["status"], string> = {
  queued: "排队中",
  building: "构建中",
  deploying: "部署中",
  live: "已上线",
  failed: "失败",
  "rolled-back": "已回滚",
};

export interface DeploymentLogsDialogProps {
  deploymentId: string;
  onClose: () => void;
}

/** Streams one deployment's pipeline output (logs are keyed by deployment id). */
export const DeploymentLogsDialog = ({
  deploymentId,
  onClose,
}: DeploymentLogsDialogProps) => {
  const scroller = useRef<HTMLDivElement>(null);

  const deployment = useQuery({
    queryKey: ["deployment", deploymentId],
    queryFn: () => api.getDeployment(deploymentId),
    refetchInterval: (query) =>
      query.state.data?.status === "building" || query.state.data?.status === "deploying"
        ? 2000
        : false,
  });
  const logs = useQuery({
    queryKey: ["logs", deploymentId],
    queryFn: () => api.listLogs(deploymentId, 500),
    refetchInterval: () => {
      const dep = deployment.data;
      return dep?.status === "building" || dep?.status === "deploying" ? 1500 : false;
    },
  });

  // Stick to the tail as new lines stream in.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.data]);

  const dep = deployment.data;
  const running = dep?.status === "building" || dep?.status === "deploying";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal
    >
      <div className="th-card flex max-h-[80vh] w-full max-w-2xl flex-col p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 th-text-secondary" />
            <h2 className="text-base font-semibold th-text-title">部署日志</h2>
            {dep && (
              <span className="font-mono text-[11px] th-text-muted">
                {dep.commitSha.slice(0, 7)} · {dep.author}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {dep && (
              <span
                className={
                  dep.status === "live"
                    ? "text-xs text-[var(--th-success-fg)]"
                    : dep.status === "failed"
                      ? "text-xs text-[var(--th-danger-fg)]"
                      : "text-xs text-[var(--th-warning-fg)]"
                }
              >
                {running && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                {STATUS_LABEL[dep.status]}
                {dep.durationMs ? ` · ${formatDuration(dep.durationMs)}` : ""}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--th-sf-06)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={scroller}
          className="th-bg-inset flex min-h-[240px] flex-1 flex-col gap-px overflow-y-auto rounded-xl p-3 font-mono text-[11px] leading-relaxed"
        >
          {(logs.data ?? []).length === 0 ? (
            <span className="th-text-muted">
              {running ? "等待输出…" : "暂无日志。"}
            </span>
          ) : (
            (logs.data ?? []).map((l) => (
              <span
                key={l.id}
                className={
                  l.level === "error" ? "text-[var(--th-danger-fg)]" : "th-text-body"
                }
              >
                {l.message}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
