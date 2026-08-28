import type { Deployment, LogEntry } from "@githelm/core";
import type { DeployStatusEvent } from "../../hooks/useDeployEvents";
import { formatDuration } from "@githelm/core";
import { useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { Loader2, Terminal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "../../lib/api";
import {
  DEPLOYMENT_STATUS_LABEL,
  DEPLOYMENT_STATUS_TEXT,
} from "../../lib/deployment";

export interface DeploymentLogsDialogProps {
  deploymentId: string;
  onClose: () => void;
}

/**
 * Follows one deployment's pipeline output. The seed comes from the logs
 * table; while the pipeline runs, `deploy-log` events append lines live and
 * `deploy-status` events update the badge — no polling.
 */
export function DeploymentLogsDialog({
  deploymentId,
  onClose,
}: DeploymentLogsDialogProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** True while the view is at the tail — new lines then auto-scroll. */
  const pinnedRef = useRef(true);
  const [cancelling, setCancelling] = useState(false);
  /** Lines that arrived as events, in arrival order. */
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  /** Status seen via events, overriding the (older) fetched record. */
  const [liveStatus, setLiveStatus] = useState<Deployment["status"] | null>(null);

  const deployment = useQuery({
    queryKey: ["deployment", deploymentId],
    queryFn: () => api.getDeployment(deploymentId),
  });
  const logs = useQuery({
    queryKey: ["logs", deploymentId],
    queryFn: () => api.listLogs(deploymentId, 500),
  });

  // Listeners bind per deployment; live state starts empty on (re)mount.
  useEffect(() => {
    let alive = true;
    const unLogs = listen<LogEntry>("deploy-log", (e) => {
      if (alive && e.payload.targetId === deploymentId) {
        setLiveLogs(prev => [...prev, e.payload]);
      }
    });
    const unStatus = listen<DeployStatusEvent>("deploy-status", (e) => {
      if (alive && e.payload.deploymentId === deploymentId) {
        setLiveStatus(e.payload.status);
      }
    });
    return () => {
      alive = false;
      void unLogs.then(off => off());
      void unStatus.then(off => off());
    };
  }, [deploymentId]);

  // Merge seed + live lines, deduped by id: a refetch can catch up past the
  // events, and both sources then overlap.
  const allLogs = useMemo(() => {
    const seen = new Set<string>();
    const out: LogEntry[] = [];
    for (const l of [...(logs.data ?? []), ...liveLogs]) {
      if (seen.has(l.id))
        continue;
      seen.add(l.id);
      out.push(l);
    }
    return out;
  }, [logs.data, liveLogs]);

  // Stick to the tail as new lines stream in — but only while the user
  // hasn't scrolled up to read; yanking the view back is worse than
  // missing the newest line.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && pinnedRef.current)
      el.scrollTop = el.scrollHeight;
  }, [allLogs]);

  const trackPinned = () => {
    const el = scrollerRef.current;
    if (!el)
      return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const dep = deployment.data;
  const status = liveStatus ?? dep?.status;
  const running = status === "building" || status === "deploying";

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
                {dep.commitSha.slice(0, 7)}
                {" "}
                ·
                {dep.author}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {status && (
              <span className={`text-xs ${DEPLOYMENT_STATUS_TEXT[status]}`}>
                {running && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                {DEPLOYMENT_STATUS_LABEL[status]}
                {dep?.durationMs ? ` · ${formatDuration(dep.durationMs)}` : ""}
              </span>
            )}
            {running && (
              <button
                type="button"
                disabled={cancelling}
                onClick={async () => {
                  setCancelling(true);
                  try {
                    await api.cancelDeployment(deploymentId);
                    toast.success("正在取消部署…");
                    void deployment.refetch();
                  }
                  catch (err) {
                    toast.error(
                      err instanceof ApiError ? err.message : "取消部署失败",
                    );
                    setCancelling(false);
                  }
                }}
                className="th-btn th-btn-secondary px-2.5 py-1 text-xs"
              >
                {cancelling
                  ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    )
                  : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                取消部署
              </button>
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
          ref={scrollerRef}
          onScroll={trackPinned}
          className="th-bg-inset flex min-h-[240px] flex-1 flex-col gap-px overflow-y-auto rounded-xl p-3 font-mono text-[11px] leading-relaxed"
        >
          {allLogs.length === 0
            ? (
                <span className="th-text-muted">
                  {running ? "等待输出…" : "暂无日志。"}
                </span>
              )
            : (
                allLogs.map(l => (
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
}
