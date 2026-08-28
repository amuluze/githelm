import { cn } from "@githelm/ui";
import {
  Command,
  Database,
  FileText,
  Folder,
  LayoutGrid,
  Mail,
  Moon,
  Plus,
  Rocket,
  Server,
  Settings,
  Shield,
  SquareTerminal,
  Sun,
  Timer,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useThemeStore } from "../../stores/theme";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const NAV_MAIN: NavItem[] = [
  { to: "/", label: "首页", icon: LayoutGrid, end: true },
  { to: "/projects", label: "项目", icon: Folder },
  { to: "/deployments", label: "部署", icon: Rocket },
  { to: "/issues", label: "问题", icon: Shield },
];

const NAV_INFRA: NavItem[] = [
  { to: "/servers", label: "服务器", icon: Server },
  { to: "/terminal", label: "终端", icon: SquareTerminal },
  { to: "/email", label: "邮件", icon: Mail },
  { to: "/tasks", label: "任务", icon: Timer },
];

const NAV_SETTINGS: NavItem[] = [
  { to: "/backup", label: "备份", icon: Database },
  { to: "/settings", label: "设置", icon: Settings },
  { to: "/logs", label: "审计日志", icon: FileText },
];

/** Helm-wheel mark lifted verbatim from githelm.pen (brand → logo path). */
function Logo() {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        transform="translate(1.47 1.5)"
        fill="currentColor"
        d="M20.61018 10.0125l-1.95 0c-0.075-1.7625-0.75-3.375-1.9875-4.8375l1.3875-1.3875c0.45-0.4125-0.1875-1.1625-0.675-0.7875l-1.425 1.425c-1.35-1.1625-2.9625-1.9875-4.9875-2.0625l0-1.9125c-0.0375-0.2625-0.225-0.45-0.4875-0.45-0.2625 0-0.4875 0.1875-0.4875 0.4875l0 1.95c-1.725 0.0375-3.375 0.5625-4.9125 1.9875l-1.4625-1.425c-0.4125-0.3375-1.05 0.1125-0.825 0.675l1.575 1.5c-1.05 1.2375-1.9125 2.8875-2.025 4.8375l-1.8375 0c-0.6 0-0.7125 0.9-0.1125 1.0125l1.9125 0c0.075 1.95 0.975 3.675 2.0625 4.875l-1.5375 1.35c-0.3 0.45 0.225 0.975 0.7125 0.7125l1.5375-1.425c1.2 1.0125 2.775 1.9125 4.95 1.9875l0 1.9125c-0.0375 0.675 0.975 0.75 0.975 0l0-1.875c1.8-0.075 3.5625-0.7125 4.95-1.9125l1.3875 1.35c0.375 0.3 1.05-0.15 0.7875-0.675l-1.4625-1.4625c1.0125-1.125 1.875-2.775 1.9875-4.8375l1.95 0c0.525 0 0.675-0.825 0-1.0125z m-5.5125-4.7625l-3.6 3.525c-0.15-0.1125-0.3375-0.1875-0.4875-0.225l0-4.8375c1.2375 0.0375 2.7 0.525 4.0875 1.5375l0 0z m-5.1-1.5375l0 4.8375c-0.1875 0.0375-0.375 0.075-0.525 0.1875l-3.4875-3.4875c0.9375-0.825 2.3625-1.4625 4.0125-1.5375z m-4.725 2.2125l3.525 3.525c-0.075 0.15-0.15 0.3375-0.1875 0.525l-5.025 0c0.075-1.275 0.6-2.9625 1.6875-4.05z m-1.65 5.1l4.95 0c0.0375 0.1875 0.1125 0.3375 0.1875 0.4875l-3.4875 2.7c-0.9-0.975-1.5375-2.4-1.65-3.1875z m2.3625 4.725l3.4875-3.4875c0.15 0.075 0.3375 0.15 0.525 0.1875l0 4.8c-1.2375-0.075-2.775-0.4875-4.0125-1.5z m5.025 1.5375l0-4.8375c0.1875-0.0375 0.375-0.1125 0.525-0.225l3.525 3.525c-1.0125 0.825-2.475 1.4625-4.05 1.5375l0 0z m4.7625-2.325l-3.4875-3.45c0.075-0.15 0.15-0.3 0.1875-0.525l4.9125 0c-0.0375 0.975-0.525 2.775-1.6125 3.975z m-3.3-4.9875c-0.0375-0.1875-0.075-0.3375-0.1875-0.525l3.4875-3.525c0.9375 1.05 1.5 2.4 1.6125 4.05l-4.9125 0 0 0z"
      />
    </svg>
  );
}

/**
 * Sidebar per githelm.pen: 232px, bg-card, divider right border, brand row
 * (logo · Githelm · theme · ⌘K), grouped nav (h36 / r10 / fs-md), and a
 * bottom "新建项目" CTA under a hairline divider.
 */
export function Sidebar() {
  const resolvedTheme = useThemeStore(s => s.resolvedTheme);
  const cycleTheme = useThemeStore(s => s.cycleTheme);

  return (
    <nav
      aria-label="主导航"
      className="th-bg-card th-bd-divider flex w-[232px] shrink-0 flex-col gap-0.5 border-r px-3 pb-3.5 pt-3.5"
    >
      <div className="flex items-center gap-2.5 px-1.5 pb-2.5 pt-0.5">
        <Logo />
        <span className="text-base th-text-strong">Githelm</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="切换主题"
            title="切换主题"
            onClick={cycleTheme}
            className="th-text-secondary flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--th-sf-05)] hover:th-text-strong"
          >
            {resolvedTheme === "dark"
              ? (
                  <Sun className="h-4 w-4" />
                )
              : (
                  <Moon className="h-4 w-4" />
                )}
          </button>
          <button
            type="button"
            aria-label="命令面板"
            title="命令面板"
            className="th-bd-default th-text-secondary flex h-6 w-6 items-center justify-center rounded-md border"
          >
            <Command className="h-[13px] w-[13px]" />
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-0.5">
        {NAV_MAIN.map(item => (
          <li key={item.to}>
            <NavItemLink item={item} />
          </li>
        ))}

        <GroupLabel label="基础设施" />
        {NAV_INFRA.map(item => (
          <li key={item.to}>
            <NavItemLink item={item} />
          </li>
        ))}

        <GroupLabel label="设置" />
        {NAV_SETTINGS.map(item => (
          <li key={item.to}>
            <NavItemLink item={item} />
          </li>
        ))}
      </ul>

      <div className="min-h-2 flex-1" />
      <div className="mb-0.5 h-px bg-[var(--th-divider)]" />
      <NavLink
        to="/library"
        className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--th-accent)] text-sm text-[var(--th-on-accent)] transition-colors hover:bg-[var(--th-accent-hover)]"
      >
        <Plus className="h-[15px] w-[15px]" />
        新建项目
      </NavLink>
    </nav>
  );
}

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-sm font-normal transition-colors",
          isActive
            ? "th-text-strong bg-[var(--th-sf-05)]"
            : "th-text-secondary hover:th-text-strong hover:bg-[var(--th-sf-04)]",
        )}
    >
      {({ isActive }) => (
        <>
          <item.icon
            className={cn("h-4 w-4", isActive ? "th-text-strong" : "th-text-muted")}
          />
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <li className="th-text-hint px-3 pb-1 pt-2.5 text-xs font-normal">
      {label}
    </li>
  );
}
