import { Card } from "@githelm/ui";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/domain/PageHeader";
import { api } from "../lib/api";

type Level = "info" | "warn" | "error" | "debug";

const LEVEL_COLOR: Record<Level, string> = {
  debug: "th-text-subtle",
  info: "th-text-body",
  warn: "text-amber-500",
  error: "text-red-500",
};

const LEVELS: Level[] = ["debug", "info", "warn", "error"];

export function LogsPage() {
  const servers = useQuery({
    queryKey: ["servers"],
    queryFn: api.listServers,
  });
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [levels, setLevels] = useState<Set<Level>>(
    () => new Set(LEVELS),
  );

  const initial = useQuery({
    queryKey: ["logs", activeTarget],
    queryFn: () => api.listLogs(activeTarget ?? undefined, 50),
    refetchInterval: paused ? false : 2000,
  });

  const seenRef = useRef<Set<string>>(new Set());
  const allLogs = useMemo(() => initial.data ?? [], [initial.data]);

  // Dedupe by id (refetch returns new data every 2s; we want a rolling window).
  const deduped = useMemo(() => {
    const out: typeof allLogs = [];
    for (const entry of allLogs) {
      if (!seenRef.current.has(entry.id)) {
        seenRef.current.add(entry.id);
        out.push(entry);
      }
    }
    return out;
  }, [allLogs]);

  const visible = deduped.filter(l => levels.has(l.level));

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title="审计日志"
          description="本地 API 与已连接服务器的实时日志流"
          actions={(
            <>
              <button
                type="button"
                className="th-btn th-btn-secondary px-3.5"
                onClick={() => setPaused(p => !p)}
              >
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {paused ? "恢复" : "暂停"}
              </button>
              <button
                type="button"
                className="th-btn th-btn-secondary px-3.5"
                onClick={() => seenRef.current.clear()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空
              </button>
            </>
          )}
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-8 pb-8 pt-5">
        <aside className="w-56 shrink-0">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider th-text-muted">
            来源
          </div>
          <ul className="space-y-1">
            <SourceItem
              label="全部"
              active={activeTarget === null}
              onClick={() => setActiveTarget(null)}
            />
            {(servers.data ?? []).map(s => (
              <SourceItem
                key={s.id}
                label={s.name}
                hint={s.host}
                active={activeTarget === s.id}
                onClick={() => setActiveTarget(s.id)}
              />
            ))}
          </ul>

          <div className="mt-6 mb-2 text-xs font-medium uppercase tracking-wider th-text-muted">
            级别
          </div>
          <div className="flex flex-wrap gap-1">
            {LEVELS.map((l) => {
              const enabled = levels.has(l);
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    const next = new Set(levels);
                    if (enabled)
                      next.delete(l);
                    else next.add(l);
                    setLevels(next);
                  }}
                  className={
                    enabled
                      ? "rounded px-2 py-0.5 text-xs th-bg-elevated th-text-title shadow-sm"
                      : "rounded px-2 py-0.5 text-xs th-text-subtle"
                  }
                >
                  {l}
                </button>
              );
            })}
          </div>
        </aside>

        <Card className="min-w-0 flex-1 overflow-hidden p-0">
          <div className="h-full overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
            {visible.map(entry => (
              <div key={entry.id} className="flex gap-2 py-0.5">
                <span className="shrink-0 th-text-subtle">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`shrink-0 w-12 uppercase ${LEVEL_COLOR[entry.level]}`}
                >
                  {entry.level}
                </span>
                <span className="th-text-body">{entry.message}</span>
              </div>
            ))}
            {!paused && (
              <div className="mt-1 th-text-subtle">
                <span className="animate-pulse">▌</span>
              </div>
            )}
            {visible.length === 0 && (
              <div className="py-12 text-center th-text-muted">
                没有符合当前筛选条件的日志。
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SourceItem({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          active
            ? "block w-full rounded-md bg-[var(--th-sf-06)] px-2.5 py-1.5 text-left"
            : "block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-[var(--th-sf-04)]"
        }
      >
        <div className="truncate text-sm th-text-title">{label}</div>
        {hint && <div className="truncate text-[11px] th-text-subtle">{hint}</div>}
      </button>
    </li>
  );
}
