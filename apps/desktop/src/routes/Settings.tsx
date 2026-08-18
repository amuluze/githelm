import { useEffect, useState } from "react";
import {
  Archive,
  Bell,
  ChevronDown,
  Database,
  EllipsisVertical,
  GitBranch,
  Info,
  Mail,
  RefreshCw,
  Server,
  Settings,
} from "lucide-react";
import { cn } from "@githelm/ui";
import { api } from "../lib/api";
import { useSettingsStore } from "../stores/settings";

const NAV_GROUPS = [
  { key: "general", label: "常规", icon: Settings },
  { key: "git", label: "Git", icon: GitBranch },
  { key: "notify", label: "通知", icon: Bell },
  { key: "email", label: "Email", icon: Mail },
  { key: "instance", label: "实例", icon: Server },
] as const;

interface SettingCardProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  pressed?: boolean;
}

const SettingCard = ({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  desc,
  trailing,
  onClick,
  pressed,
}: SettingCardProps) => {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      aria-pressed={onClick ? pressed : undefined}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-2xl border border-th-divider bg-th-bg-card px-5 py-[18px] text-left",
        onClick && "transition-colors hover:bg-[var(--th-bg-card-2)]",
      )}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: iconBg }}
      >
        <Icon className="h-[18px] w-[18px]" style={{ color: iconColor }} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[15px] th-text-strong">{title}</span>
        <span className="text-[13px] th-text-muted">{desc}</span>
      </span>
      {trailing}
    </Comp>
  );
};

const Pill = ({ label, on }: { label: string; on: boolean }) => (
  <span
    className={cn(
      "rounded-full px-2.5 py-1 text-xs",
      on
        ? "bg-[var(--th-success-bg)] text-[var(--th-success-fg)]"
        : "bg-[var(--th-on-05)] text-[var(--th-text-secondary)]",
    )}
  >
    {label}
  </span>
);

export const SettingsPage = () => {
  const autoUpdate = useSettingsStore((s) => s.autoUpdate);
  const setAutoUpdate = useSettingsStore((s) => s.setAutoUpdate);
  const [instanceVersion, setInstanceVersion] = useState("v1.2.0");

  useEffect(() => {
    let cancelled = false;
    api
      .getAppVersion()
      .then((v) => {
        if (!cancelled) setInstanceVersion(`v${v.version}`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl tracking-[-0.2px] th-text-strong">实例</h1>
          <p className="text-[13px] th-text-muted">
            查看实例信息并管理更新与存储
          </p>
        </div>
        <button
          type="button"
          aria-label="更多操作"
          className="flex h-8 w-8 items-center justify-center rounded-lg th-text-secondary transition-colors hover:bg-[var(--th-on-05)]"
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </header>

      <div className="flex gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <SettingCard
            icon={Info}
            iconBg="var(--th-info-bg)"
            iconColor="var(--th-info-fg)"
            title="实例信息"
            desc={`Githelm ${instanceVersion} · Docker 27.3`}
            trailing={<Pill label="运行正常" on />}
          />
          <SettingCard
            icon={Database}
            iconBg="var(--th-orange-bg)"
            iconColor="var(--th-orange-fg)"
            title="数据存储"
            desc="数据目录与存储占用"
            trailing={<span className="text-[13px] th-text-secondary">2.4 GB</span>}
          />
          <SettingCard
            icon={RefreshCw}
            iconBg="var(--th-success-bg)"
            iconColor="var(--th-success-fg)"
            title="自动更新"
            desc="检测到新版本时自动更新"
            onClick={() => setAutoUpdate(!autoUpdate)}
            pressed={autoUpdate}
            trailing={<Pill label={autoUpdate ? "已开启" : "已关闭"} on={autoUpdate} />}
          />
          <SettingCard
            icon={Archive}
            iconBg="var(--th-warning-bg)"
            iconColor="var(--th-warning-fg)"
            title="备份与恢复"
            desc="实例数据的备份策略"
            trailing={<ChevronDown className="h-4 w-4 th-text-muted" />}
          />
        </div>

        <nav className="w-[300px] shrink-0 rounded-2xl border border-th-divider bg-th-bg-card p-2">
          {NAV_GROUPS.map((group) => {
            const active = group.key === "instance";
            return (
              <div
                key={group.key}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-[9px]",
                  active ? "bg-[var(--th-on-05)]" : "hover:bg-[var(--th-on-04)]",
                )}
              >
                <group.icon
                  className={cn("h-4 w-4", active ? "th-text-strong" : "th-text-muted")}
                />
                <span
                  className={cn(
                    "text-[13px]",
                    active ? "th-text-strong" : "th-text-secondary",
                  )}
                >
                  {group.label}
                </span>
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
