import { CircleCheck, CircleDot, Wifi, WifiOff } from "lucide-react";
import { useThemeStore } from "../../stores/theme";
import { useServerHealth } from "../../hooks/useServerHealth";

export const StatusBar = () => {
  const theme = useThemeStore((s) => s.theme);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const { connected, latencyMs, serverCount } = useServerHealth();

  return (
    <footer
      className="flex h-7 shrink-0 items-center justify-between border-t th-bd-subtle px-3 text-[11px] th-text-muted"
      style={{ backgroundColor: "var(--th-bg-inset)" }}
    >
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          {connected ? (
            <CircleCheck className="h-3 w-3 text-emerald-500" />
          ) : (
            <CircleDot className="h-3 w-3 text-amber-500" />
          )}
          <span>{connected ? "API online" : "API offline"}</span>
        </span>
        <span aria-hidden>·</span>
        <span className="flex items-center gap-1.5">
          {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {connected ? `${latencyMs}ms` : "—"}
        </span>
        <span aria-hidden>·</span>
        <span>{serverCount} servers</span>
      </div>

      <div className="flex items-center gap-3">
        <span>
          theme: {theme}
          {theme === "system" && ` (${resolvedTheme})`}
        </span>
        <span aria-hidden>·</span>
        <span>Tauri 2 · React 19</span>
      </div>
    </footer>
  );
};