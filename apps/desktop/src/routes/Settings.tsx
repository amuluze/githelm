import { cn } from "@githelm/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Bell,
  Database,
  GitBranch,
  Info,
  Mail,
  RefreshCw,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "../lib/api";
import { useSettingsStore } from "../stores/settings";
import { useThemeStore } from "../stores/theme";

type Tab = "general" | "git" | "notify" | "email" | "instance";

const TABS: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "general", label: "常规", icon: Settings },
  { key: "git", label: "Git", icon: GitBranch },
  { key: "notify", label: "通知", icon: Bell },
  { key: "email", label: "Email", icon: Mail },
  { key: "instance", label: "实例", icon: Database },
];

const TAB_HEADER: Record<Tab, { title: string; desc: string }> = {
  general: { title: "常规", desc: "外观与应用行为" },
  git: { title: "Git", desc: "GitHub 账号与凭据管理" },
  notify: { title: "通知", desc: "部署结果的系统通知策略" },
  email: { title: "Email", desc: "邮件集成" },
  instance: { title: "实例", desc: "查看实例信息并管理更新与存储" },
};

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

function SettingCard({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  desc,
  trailing,
  onClick,
  pressed,
}: SettingCardProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      aria-pressed={onClick ? pressed : undefined}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-2xl border px-5 py-[18px] text-left",
        onClick
          ? pressed
            ? "border-[var(--th-accent)] bg-[var(--th-bg-card)]"
            : "border-th-divider bg-th-bg-card transition-colors hover:bg-[var(--th-bg-card-2)]"
          : "border-th-divider bg-th-bg-card",
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
}

function Pill({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs",
        on
          ? "bg-[var(--th-success-bg)] text-[var(--th-success-fg)]"
          : "bg-[var(--th-on-05)] text-[var(--th-text-secondary)]",
      )}
    >
      {label}
    </span>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const header = TAB_HEADER[tab];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex flex-col gap-1 p-8 pb-0">
        <h1 className="text-2xl tracking-[-0.2px] th-text-strong">{header.title}</h1>
        <p className="text-[13px] th-text-muted">{header.desc}</p>
      </header>

      <div className="flex gap-6 p-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {tab === "general" && <GeneralPanel />}
          {tab === "git" && <GitPanel />}
          {tab === "notify" && <NotifyPanel />}
          {tab === "email" && <EmailPanel />}
          {tab === "instance" && <InstancePanel />}
        </div>

        <nav
          aria-label="设置分组"
          className="th-bd-divider th-bg-card w-[240px] shrink-0 self-start rounded-2xl border p-2"
        >
          {TABS.map((group) => {
            const active = group.key === tab;
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => setTab(group.key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-[9px] text-left",
                  active
                    ? "bg-[var(--th-on-05)]"
                    : "hover:bg-[var(--th-on-04)]",
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
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

// ── 常规 ─────────────────────────────────────────────────────────────────

function GeneralPanel() {
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);

  const options: Array<{ key: "light" | "dark" | "system"; label: string }> = [
    { key: "light", label: "浅色" },
    { key: "dark", label: "深色" },
    { key: "system", label: "跟随系统" },
  ];

  return (
    <section className="th-bd-divider th-bg-card rounded-2xl border p-5">
      <h2 className="text-[15px] th-text-strong">外观主题</h2>
      <p className="mt-[3px] text-[13px] th-text-muted">
        跟随系统时，主题随操作系统的浅色 / 深色设置自动切换。
      </p>
      <div className="mt-4 flex gap-2">
        {options.map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => setTheme(o.key)}
            aria-pressed={theme === o.key}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-[13px] transition-colors",
              theme === o.key
                ? "bg-[var(--th-accent)] text-[var(--th-on-accent)]"
                : "th-text-secondary hover:th-text-strong hover:bg-[var(--th-on-04)]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Git ──────────────────────────────────────────────────────────────────

function GitPanel() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["github-status"],
    queryFn: api.githubStatus,
  });

  const disconnect = useMutation({
    mutationFn: api.clearGithubToken,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["github-status"] });
      toast.success("已解除 GitHub 连接");
    },
    onError: err =>
      toast.error(err instanceof ApiError ? err.message : "解除连接失败"),
  });

  if (status.isLoading) {
    return (
      <section className="th-bd-divider th-bg-card flex h-24 items-center justify-center rounded-2xl border">
        <span className="text-sm th-text-muted">加载中…</span>
      </section>
    );
  }

  const connected = status.data?.connected;
  const login = status.data?.login;
  const source = status.data?.source;

  return (
    <>
      <SettingCard
        icon={GitBranch}
        iconBg="var(--th-info-bg)"
        iconColor="var(--th-info-fg)"
        title={connected ? `已连接：${login ?? "GitHub 账号"}` : "未连接 GitHub 账号"}
        desc={connected
          ? `凭据来源：${source === "gh-cli" ? "gh CLI" : "钥匙串令牌"}（令牌仅存于系统钥匙串）`
          : "在导入项目时保存访问令牌即可连接，凭据存于系统钥匙串。"}
        trailing={
          connected
            ? (
                <button
                  type="button"
                  disabled={disconnect.isPending}
                  onClick={() => disconnect.mutate()}
                  className="th-btn th-btn-soft shrink-0 px-3 text-[13px] text-[var(--th-danger-fg)]"
                >
                  {disconnect.isPending ? "解除中…" : "解除绑定"}
                </button>
              )
            : <Pill label="未连接" on={false} />
        }
      />
      <p className="px-1 text-xs leading-relaxed th-text-hint">
        连接状态用于 GitHub 导入（仓库 / 分支列表）；部署构建使用本地 git 与 SSH，
        不依赖该连接。
      </p>
    </>
  );
}

// ── 通知 ─────────────────────────────────────────────────────────────────

function NotifyPanel() {
  const notifyPolicy = useSettingsStore(s => s.notifyPolicy);
  const setNotifyPolicy = useSettingsStore(s => s.setNotifyPolicy);

  const options: Array<{
    key: "all" | "background" | "off";
    title: string;
    desc: string;
  }> = [
    { key: "all", title: "总是通知", desc: "部署结束时无论窗口是否可见都发送系统通知" },
    { key: "background", title: "仅后台", desc: "只在窗口隐藏（切走或最小化）时通知，推荐" },
    { key: "off", title: "关闭", desc: "不发送部署通知，结果仍可在部署列表与问题页查看" },
  ];

  return (
    <>
      {options.map(o => (
        <SettingCard
          key={o.key}
          icon={Bell}
          iconBg="var(--th-warning-bg)"
          iconColor="var(--th-warning-fg)"
          title={o.title}
          desc={o.desc}
          pressed={notifyPolicy === o.key}
          onClick={() => setNotifyPolicy(o.key)}
          trailing={<Pill label={notifyPolicy === o.key ? "已选择" : ""} on={notifyPolicy === o.key} />}
        />
      ))}
      <p className="px-1 text-xs leading-relaxed th-text-hint">
        通知覆盖部署成功、失败与取消；系统会自动请求通知权限。
      </p>
    </>
  );
}

// ── Email ────────────────────────────────────────────────────────────────

function EmailPanel() {
  return (
    <SettingCard
      icon={Mail}
      iconBg="var(--th-on-05)"
      iconColor="var(--th-text-secondary)"
      title="邮件集成尚未开放"
      desc="计划支持告警邮件与部署结果的邮件推送，敬请期待。"
      trailing={<Pill label="即将推出" on={false} />}
    />
  );
}

// ── 实例 ─────────────────────────────────────────────────────────────────

function InstancePanel() {
  const autoUpdate = useSettingsStore(s => s.autoUpdate);
  const setAutoUpdate = useSettingsStore(s => s.setAutoUpdate);
  const [versionLabel, setVersionLabel] = useState("—");
  const [dataDir, setDataDir] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAppVersion()
      .then((v) => {
        if (!cancelled)
          setVersionLabel(`v${v.version} · Tauri ${v.tauri}`);
      })
      .catch(() => {});
    api
      .getDataDir()
      .then((p) => {
        if (!cancelled)
          setDataDir(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SettingCard
        icon={Info}
        iconBg="var(--th-info-bg)"
        iconColor="var(--th-info-fg)"
        title="实例信息"
        desc={`Githelm ${versionLabel}`}
      />
      <SettingCard
        icon={Database}
        iconBg="var(--th-orange-bg)"
        iconColor="var(--th-orange-fg)"
        title="数据存储"
        desc={dataDir ? `数据目录：${dataDir}` : "数据目录：~/.githelm（SQLite 数据库与密钥）"}
      />
      <SettingCard
        icon={RefreshCw}
        iconBg="var(--th-success-bg)"
        iconColor="var(--th-success-fg)"
        title="自动更新"
        desc="检测到新版本时自动下载安装"
        onClick={() => setAutoUpdate(!autoUpdate)}
        pressed={autoUpdate}
        trailing={<Pill label={autoUpdate ? "已开启" : "已关闭"} on={autoUpdate} />}
      />
      <SettingCard
        icon={Archive}
        iconBg="var(--th-warning-bg)"
        iconColor="var(--th-warning-fg)"
        title="备份与恢复"
        desc="实例数据的备份与还原"
        trailing={<Pill label="即将推出" on={false} />}
      />
    </>
  );
}
