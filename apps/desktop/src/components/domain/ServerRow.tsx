import {
  Badge,
  StatusDot,
} from "@githelm/ui";
import type { Server as ServerModel, ServerKind, ServerStatus } from "@githelm/core";
import { formatRelativeTime } from "@githelm/core";
import { Cloud, Server as ServerIcon, Terminal, Trash2 } from "lucide-react";

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

export interface ServerRowProps {
  server: ServerModel;
  onRemove?: (id: string) => void;
}

export const ServerRow = ({ server, onRemove }: ServerRowProps) => {
  const Icon = KIND_ICON[server.kind];
  return (
    <div className="flex items-center gap-3 border-b th-bd-subtle px-4 py-3 last:border-b-0">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--th-sf-06)]">
        {server.kind === "cloud" ? (
          <Cloud className="h-4 w-4" />
        ) : (
          <ServerIcon className="h-4 w-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium th-text-title">{server.name}</span>
          <Badge variant="muted" className="gap-1">
            <Icon className="h-3 w-3" />
            {server.kind === "ssh" ? "SSH" : server.region ?? "Cloud"}
          </Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs th-text-muted">
          <span className="font-mono">{server.host}</span>
          <span aria-hidden>·</span>
          <span>last seen {formatRelativeTime(server.lastSeenAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
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
          {server.status}
        </Badge>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(server.id)}
            className="flex h-7 w-7 items-center justify-center rounded-md th-text-muted hover:bg-red-500/10 hover:text-red-600"
            aria-label={`Remove ${server.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};