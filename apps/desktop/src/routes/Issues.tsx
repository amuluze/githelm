import type { Issue, IssueKind } from "@githelm/core";
import { formatRelativeTime } from "@githelm/core";
import { Badge } from "@githelm/ui";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Globe,
  RefreshCw,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { SkeletonListIllustration } from "../components/domain/Illustrations";
import { PageHeader } from "../components/domain/PageHeader";
import { useNow } from "../hooks/useNow";
import { api } from "../lib/api";

/** issues-mock in githelm.pen. */

type Tab = "open" | "resolved";

const KIND_ICON: Record<IssueKind, React.ComponentType<{ className?: string }>> = {
  deployment: AlertTriangle,
  certificate: Shield,
  domain: Globe,
  version: Shield,
  port: AlertTriangle,
};

export function IssuesPage() {
  const issues = useQuery({ queryKey: ["issues"], queryFn: api.listIssues });
  const [tab, setTab] = useState<Tab>("open");

  const open = useMemo(
    () => (issues.data ?? []).filter(i => i.status === "open"),
    [issues.data],
  );
  const resolved = useMemo(
    () => (issues.data ?? []).filter(i => i.status === "resolved"),
    [issues.data],
  );
  const visible = tab === "open" ? open : resolved;

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title="问题"
          description="Githelm 在你的项目、服务器和域名中发现的所有问题。"
          actions={(
            <button
              type="button"
              onClick={() => void issues.refetch()}
              disabled={issues.isRefetching}
              className="th-btn th-btn-secondary px-3.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${issues.isRefetching ? "animate-spin" : ""}`}
              />
              重新扫描
            </button>
          )}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-8 pb-8 pt-5">
        <div className="flex items-center gap-1">
          <TabButton label="未解决" active={tab === "open"} onClick={() => setTab("open")} />
          <TabButton label="已解决" active={tab === "resolved"} onClick={() => setTab("resolved")} />
        </div>

        {issues.isLoading
          ? (
              <section className="th-card flex flex-1 items-center justify-center">
                <div className="text-sm th-text-muted">加载中…</div>
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
                      <IssueRow key={issue.id} issue={issue} />
                    ))}
                  </section>
                )}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
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
        没有被阻止或等待中的部署，没有证书或域名问题，没有落后的版本，也没有运行在错误端口上的服务。检查会继续在后台运行。
      </p>
    </section>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const Icon = KIND_ICON[issue.kind];
  const now = useNow();
  return (
    <div className="flex items-start gap-3 border-b border-[var(--th-divider)] px-5 py-3 last:border-b-0">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--th-sf-05)]">
        <Icon className="h-4 w-4 th-text-secondary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium th-text-strong">{issue.title}</span>
          <Badge variant="success">
            <ShieldCheck className="h-3 w-3" />
            已解决
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[13px] th-text-muted">{issue.description}</p>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs th-text-strong">{issue.targetName}</div>
        <div className="mt-0.5 text-[11px] th-text-hint">
          {formatRelativeTime(issue.resolvedAt ?? issue.detectedAt, now, "zh")}
        </div>
      </div>
    </div>
  );
}
