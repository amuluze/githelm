import { NavLink } from "react-router-dom";
import {
  Activity,
  Cloud,
  Cog,
  LayoutDashboard,
  Package,
  Server,
  TerminalSquare,
} from "lucide-react";
import { cn } from "@githelm/ui";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: Package },
  { to: "/deployments", label: "Deployments", icon: Activity },
  { to: "/servers", label: "Servers", icon: Server },
  { to: "/logs", label: "Logs", icon: TerminalSquare },
  { to: "/settings", label: "Settings", icon: Cog },
];

export const Sidebar = () => (
  <nav
    aria-label="Primary"
    className="flex w-56 shrink-0 flex-col border-r th-bd-subtle"
    style={{ backgroundColor: "var(--th-bg-elevated)" }}
  >
    <ul className="flex flex-col gap-0.5 p-2">
      {NAV.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-[var(--th-sf-06)] th-text-title"
                  : "th-text-body hover:bg-[var(--th-sf-04)]",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        </li>
      ))}
    </ul>

    <div className="mt-auto p-2">
      <div className="rounded-md border th-bd-subtle p-3 text-xs">
        <div className="flex items-center gap-1.5 th-text-muted">
          <Cloud className="h-3 w-3" />
          <span>Mode</span>
        </div>
        <div className="mt-1 font-medium th-text-title">Local preview</div>
        <div className="mt-1 th-text-subtle">
          Mock data · no API server attached
        </div>
      </div>
    </div>
  </nav>
);