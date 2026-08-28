import type { Issue, IssueKind } from "@githelm/core";
import { formatRelativeTime } from "@githelm/core";
import { Badge } from "@githelm/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Globe,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DeploymentLogsDialog } from "../components/domain/DeploymentLogsDialog";
import { SkeletonListIllustration } from "../components/domain/Illustrations";
import { PageHeader } from "../components/domain/PageHeader";
import { useNow } from "../hooks/useNow";
import { api, ApiError } from "../lib/api";

/** issues: record / track problems from build, deploy and ops flows. */

type Tab = "open" | "resolved";

const KIND_ICON: Record<IssueKind, React.ComponentType<{ className?: string }>> = {
  deployment: AlertTriangle,
  certificate: Shield,
  domain: Globe,
  version: Shield,
  port: AlertTriangle,
};

function toastError(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback);
}

export function IssuesPage() {
  const queryClient = useQueryClient();
  const issues = useQuery({ queryKey: ["issues"], queryFn: api.listIssues });
  const [tab, setTab] = useState<Tab>("open");
  const [pendingDelete, setPendingDelete] = useState<Issue | null>(null);
  const [logDeploymentId, setLogDeploymentId] = useState<string | null>(null);

  const open = useMemo(
    () => (issues.data ?? []).filter(i => i.status === "open"),
    [issues.data],
  );
  const resolved = useMemo(
    () => (issues.data ?? []).filter(i => i.status === "resolved"),
    [issues.data],
  );
  const visible = tab === "open" ? open : resolved;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["issues"] });
  };

  const scan = useMutation({
    mutationFn: api.scanIssues,
    onSuccess: (s) => {
      toast.success(
        `扫描完成：检查 ${s.checked} 个项目，新发现 ${s.opened} 个，自动解决 ${s.resolved} 个`,
      );
      invalidate();
    },
    onError: err => toastError(err, "扫描失败"),
  });
  const resolve = useMutation({
    mutationFn: (id: string) => api.resolveIssue(id),
    onSuccess: () => {
      toast.success("已标记为解决");
      invalidate();
    },
    onError: err => toastError(err, "标记解决失败"),
  });
  const reopen = useMutation({
    mutationFn: (id: string) => api.reopenIssue(id),
    onSuccess: () => {
      toast.success("已重新打开");
      invalidate();
    },
    onError: err => toastError(err, "重新打开失败"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteIssue(id),
    onSuccess: () => {
      setPendingDelete(null);
      toast.success("已删除");
      invalidate();
    },
    onError: err => toastError(err, "删除失败"),
  });
  const busy = resolve.isPending || reopen.isPending || remove.isPending;

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title="问题"
          description="各项目在编译、部署与运维过程中自动记录的问题及处理进展。"
          actions={(
            <button
              type="button"
              onClick={() => scan.mutate()}
              disabled={scan.isPending}
              className="th-btn th-btn-secondary px-3.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${scan.isPending ? "animate-spin" : ""}`}
              />
              {scan.isPending ? "扫描中…" : "重新扫描"}
            </button>
          )}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-8 pb-8 pt-5">
        <div className="flex items-center gap-1">
          <TabButton label="未解决" count={open.length} active={tab === "open"} onClick={() => setTab("open")} />
          <TabButton label="已解决" count={resolved.length} active={tab === "resolved"} onClick={() => setTab("resolved")} />
        </div>

        {issues.isLoading
          ? (
              <section className="th-card flex flex-1 items-center justify-center">
                <div className="text-sm th-text-muted">加载中…</div>
              </section>
            )
          : issues.isError
            ? (
                <section className="th-card flex flex-1 flex-col items-center justify-center gap-3">
                  <p className="text-sm th-text-muted">
                    问题列表加载失败：
                    {issues.error.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => void issues.refetch()}
                    className="th-btn th-btn-soft px-3.5"
                  >
                    重试
                  </button>
                </section>
              )
            : visible.length === 0 && tab === "open"
              ? (
                  <AllClearCard />
                )
              : visible.length === 0
                ? (
                    <section className="th-card flex flex-1 items-center justify-center">
                      <p className="text-sm th-text-muted">尚无已解决的问题。</p>
                    </section>
                  )
                : (
                    <section className="th-card min-h-0 flex-1 overflow-auto">
                      {visible.map(issue => (
                        <IssueRow
                          key={issue.id}
                          issue={issue}
                          busy={busy}
                          onResolve={id => resolve.mutate(id)}
                          onReopen={id => reopen.mutate(id)}
                          onDelete={setPendingDelete}
                          onOpenLogs={setLogDeploymentId}
                        />
                      ))}
                    </section>
                  )}
      </div>

      {logDeploymentId && (
        <DeploymentLogsDialog
          deploymentId={logDeploymentId}
          onClose={() => setLogDeploymentId(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDeleteDialog
          issue={pendingDelete}
          deleting={remove.isPending}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => remove.mutate(pendingDelete.id)}
        />
      )}
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "th-bd-default th-bg-card th-text-strong rounded-lg border px-3 py-[7px] text-[13px]"
          : "th-text-secondary rounded-lg px-3 py-[7px] text-[13px] transition-colors hover:th-text-strong"
      }
    >
      {label}
      {count > 0 && (
        <span className="ml-1.5 text-[11px] th-text-hint">{count}</span>
      )}
    </button>
  );
}

/** Empty state for the "未解决" tab — mirrors issues-mock in githelm.pen. */
function AllClearCard() {
  return (
    <section className="th-card flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5">
      <SkeletonListIllustration />
      <h2 className="text-lg th-text-strong">没有需要处理的问题</h2>
      <p className="max-w-[480px] text-center text-[13px] leading-[1.6] th-text-muted">
        当前没有未处理的问题。部署失败会自动在这里建单，下一次成功部署自动解决；域名、端口与证书可用性每
        5
        分钟在后台检查一次，也可以随时点击右上角「重新扫描」立即检查。
      </p>
    </section>
  );
}

function IssueRow({
  issue,
  busy,
  onResolve,
  onReopen,
  onDelete,
  onOpenLogs,
}: {
  issue: Issue;
  busy: boolean;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onDelete: (issue: Issue) => void;
  onOpenLogs: (deploymentId: string) => void;
}) {
  const Icon = KIND_ICON[issue.kind];
  const now = useNow();
  const isOpen = issue.status === "open";
  /** Long failure output is unreadable when truncated — click to toggle. */
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="group flex items-start gap-3 border-b border-[var(--th-divider)] px-5 py-3 last:border-b-0">
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isOpen ? "bg-[var(--th-danger-bg)]" : "bg-[var(--th-sf-05)]"}`}
      >
        <Icon
          className={`h-4 w-4 ${
            isOpen ? "text-[var(--th-danger-fg)]" : "th-text-secondary"}`}
        />
      </div>

      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        title={expanded ? "收起详情" : "展开详情"}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium th-text-strong">{issue.title}</span>
          {isOpen
            ? (
                <Badge variant="danger">
                  <AlertTriangle className="h-3 w-3" />
                  未解决
                </Badge>
              )
            : (
                <Badge variant="success">
                  <ShieldCheck className="h-3 w-3" />
                  已解决
                </Badge>
              )}
        </div>
        <p
          className={`mt-0.5 text-[13px] th-text-muted ${
            expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}
        >
          {issue.description}
        </p>
      </button>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {issue.deploymentId && (
          <button
            type="button"
            title="查看部署日志"
            onClick={() => onOpenLogs(issue.deploymentId ?? "")}
            className="flex h-7 w-7 items-center justify-center rounded-md th-text-secondary hover:bg-[var(--th-sf-06)] hover:th-text-strong"
          >
            <ScrollText className="h-3.5 w-3.5" />
          </button>
        )}
        {isOpen
          ? (
              <button
                type="button"
                disabled={busy}
                title="标记为已解决"
                onClick={() => onResolve(issue.id)}
                className="flex h-7 w-7 items-center justify-center rounded-md th-text-secondary hover:bg-[var(--th-sf-06)] hover:th-text-strong disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )
          : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  title="重新打开"
                  onClick={() => onReopen(issue.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md th-text-secondary hover:bg-[var(--th-sf-06)] hover:th-text-strong disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  title="删除记录"
                  onClick={() => onDelete(issue)}
                  className="flex h-7 w-7 items-center justify-center rounded-md th-text-secondary hover:bg-[var(--th-sf-06)] hover:th-text-strong disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
      </div>

      <div className="w-28 shrink-0 text-right">
        <div className="truncate text-xs th-text-strong" title={issue.targetName}>
          {issue.targetName}
        </div>
        <div className="mt-0.5 text-[11px] th-text-hint">
          {isOpen ? "检测于 " : "解决于 "}
          {formatRelativeTime(issue.resolvedAt ?? issue.detectedAt, now, "zh")}
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({
  issue,
  deleting,
  onClose,
  onConfirm,
}: {
  issue: Issue;
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold th-text-title">删除问题记录</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--th-sf-06)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[13px] leading-[1.6] th-text-secondary">
          将删除「
          {issue.title}
          」这条记录。此操作不可撤销。
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
