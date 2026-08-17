import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

type Platform = "macos" | "windows" | "linux";

/**
 * macOS-style title bar. On macOS the OS draws the traffic-light buttons and
 * we only need a draggable region; on Windows / Linux we draw custom buttons.
 */
export const TitleBar = () => {
  const [platform, setPlatform] = useState<Platform>("macos");

  useEffect(() => {
    if (!import.meta.env.TAURI_PLATFORM) {
      setPlatform("windows");
      return;
    }
    const map: Record<string, Platform> = {
      darwin: "macos",
      win32: "windows",
      linux: "linux",
    };
    const next = map[import.meta.env.TAURI_PLATFORM];
    if (next) setPlatform(next);
  }, []);

  return (
    <header
      data-tauri-drag-region
      className="th-drag relative flex h-11 shrink-0 items-center justify-between border-b th-bd-subtle px-3 text-[13px]"
      style={{ backgroundColor: "var(--th-titlebar-bg)" }}
    >
      <div className="flex items-center gap-2 th-no-drag">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-[var(--th-accent)] text-white">
          <span className="text-[10px] font-bold">GH</span>
        </div>
        <span className="font-medium th-text-title">Githelm</span>
      </div>

      <div
        className="absolute left-1/2 -translate-x-1/2 th-text-muted"
        aria-hidden
      >
        v0.1.0
      </div>

      <div className="flex items-center gap-1 th-no-drag">
        {platform === "macos" ? <MacOSControls /> : <WindowsControls />}
      </div>
    </header>
  );
};

const MacOSControls = () => (
  <div className="flex gap-1.5 px-2">
    <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
    <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
    <div className="h-3 w-3 rounded-full bg-[#28c840]" />
  </div>
);

const WindowsControls = () => {
  const win = getCurrentWindow();
  return (
    <div className="flex">
      <button
        aria-label="Minimize"
        onClick={() => void win.minimize()}
        className="flex h-8 w-10 items-center justify-center hover:bg-[var(--th-sf-06)]"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label="Maximize"
        onClick={() => void win.toggleMaximize()}
        className="flex h-8 w-10 items-center justify-center hover:bg-[var(--th-sf-06)]"
      >
        <Square className="h-3 w-3" />
      </button>
      <button
        aria-label="Close"
        onClick={() => void win.close()}
        className="flex h-8 w-10 items-center justify-center hover:bg-red-500 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};