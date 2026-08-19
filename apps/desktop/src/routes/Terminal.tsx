import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  ChevronLeft,
  Cloud,
  Plus,
  RotateCw,
  Server as ServerIcon,
  SquareTerminal,
} from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/domain/PageHeader";
import { ServerStackIllustration } from "../components/domain/Illustrations";

/** Server picker for /terminal — then the xterm session lives at /terminal/:id. */

export const TerminalPage = () => {
  const { serverId } = useParams<{ serverId: string }>();
  if (serverId) return <TerminalSessionPage serverId={serverId} />;
  return <TerminalPickerPage />;
};

const TerminalPickerPage = () => {
  const navigate = useNavigate();
  const servers = useQuery({ queryKey: ["servers"], queryFn: api.listServers });

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title="终端"
          description="通过 SSH 连接你的服务器，获得完整的交互式终端"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-5">
        {servers.isLoading ? (
          <div className="th-card flex flex-1 items-center justify-center text-sm th-text-muted">
            加载服务器…
          </div>
        ) : (servers.data ?? []).length === 0 ? (
          <div className="th-card flex flex-1 flex-col items-center justify-center gap-3.5">
            <ServerStackIllustration />
            <h2 className="text-lg th-text-strong">还没有服务器</h2>
            <p className="max-w-[420px] text-center text-[13px] leading-[1.6] th-text-secondary">
              添加一台服务器后，即可在这里直接打开它的 SSH 终端。
            </p>
            <Link to="/servers" className="th-btn th-btn-primary px-[18px] py-2.5">
              <Plus className="h-3.5 w-3.5" />
              添加服务器
            </Link>
          </div>
        ) : (
          <div className="th-card overflow-hidden">
            {(servers.data ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(`/terminal/${s.id}`)}
                className="flex w-full items-center gap-3 border-b border-[var(--th-divider)] px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--th-sf-03)]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--th-sf-05)]">
                  {s.kind === "cloud" ? (
                    <Cloud className="h-4 w-4 th-text-strong" />
                  ) : (
                    <ServerIcon className="h-4 w-4 th-text-strong" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium th-text-strong">{s.name}</span>
                  <span className="truncate font-mono text-xs th-text-muted">
                    {s.username ? `${s.username}@` : ""}
                    {s.host}
                    {s.port !== 22 ? `:${s.port}` : ""}
                  </span>
                </span>
                <SquareTerminal className="h-4 w-4 shrink-0 th-text-hint" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface OutputEvent {
  serverId: string;
  data: string;
}

interface ExitEvent {
  serverId: string;
  code: number | null;
}

/** base64 → bytes; keeps UTF-8 sequences intact across chunk boundaries. */
const decodeBase64 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const cssVar = (name: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
};

const TerminalSessionPage = ({ serverId }: { serverId: string }) => {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [exited, setExited] = useState(false);

  const servers = useQuery({ queryKey: ["servers"], queryFn: api.listServers });
  const server = (servers.data ?? []).find((s) => s.id === serverId);

  useEffect(() => {
    if (!container.current) return;
    setExited(false);

    const term = new XTerm({
      fontSize: 12.5,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      cursorBlink: true,
      theme: {
        background: cssVar("--th-bg-inset", "#0d1017"),
        foreground: cssVar("--th-text-body", "#d6dae3"),
        cursor: cssVar("--th-accent", "#4c8dff"),
        selectionBackground: cssVar("--th-sf-05", "#3a4252"),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container.current);
    fit.fit();
    term.focus();
    term.writeln("\x1b[2m正在建立 SSH 连接…\x1b[0m");

    const disposers: Array<() => void> = [];
    disposers.push(
      term.onData((data) => {
        void api.terminalWrite(serverId, data).catch(() => setExited(true));
      }).dispose,
    );
    disposers.push(
      term.onResize(({ cols, rows }) => {
        void api.terminalResize(serverId, cols, rows).catch(() => {});
      }).dispose,
    );

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // fit throws before the first layout settles; the next tick retries.
      }
    });
    observer.observe(container.current);
    disposers.push(() => observer.disconnect());

    let alive = true;
    void (async () => {
      const offOutput = await listen<OutputEvent>("terminal-output", (e) => {
        if (alive && e.payload.serverId === serverId) {
          term.write(decodeBase64(e.payload.data));
        }
      });
      const offExit = await listen<ExitEvent>("terminal-exit", (e) => {
        if (alive && e.payload.serverId === serverId) {
          setExited(true);
        }
      });
      if (!alive) {
        offOutput();
        offExit();
        return;
      }
      disposers.push(offOutput, offExit);

      try {
        await api.terminalOpen(serverId);
        term.focus();
      } catch (err) {
        term.writeln(`\r\n\x1b[31m无法启动终端：${String(err)}\x1b[0m`);
        setExited(true);
      }
    })();

    return () => {
      alive = false;
      disposers.forEach((d) => d());
      void api.terminalClose(serverId).catch(() => {});
      term.dispose();
    };
  }, [serverId, attempt]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader
          title={server?.name ?? "终端"}
          description={
            server
              ? `${server.username ? `${server.username}@` : ""}${server.host}${server.port !== 22 ? `:${server.port}` : ""}`
              : "SSH 会话"
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="th-btn th-btn-secondary px-3.5"
              >
                <RotateCw className="h-3.5 w-3.5" />
                {exited ? "重新连接" : "重启会话"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/terminal")}
                className="th-btn th-btn-soft px-3"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                切换服务器
              </button>
            </>
          }
        />
      </div>

      <div className="min-h-0 flex-1 px-8 pb-8 pt-5">
        <div className="relative h-full overflow-hidden rounded-2xl border th-bd-default">
          <div ref={container} className="h-full w-full bg-[var(--th-bg-inset)] p-3" />
          {exited && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--th-bg-inset)]/80 backdrop-blur-sm">
              <p className="text-sm th-text-secondary">连接已断开</p>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="th-btn th-btn-primary px-4"
              >
                <RotateCw className="h-3.5 w-3.5" />
                重新连接
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
