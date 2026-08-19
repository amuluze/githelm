import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Title bar per githelm.pen (44px, page background). The window controls are
 * macOS-style traffic lights at the top-left — red closes, yellow minimizes,
 * green toggles maximize — with the hover glyphs users expect. Back/forward
 * history buttons sit after them. The whole surface is a Tauri drag region:
 * `data-tauri-drag-region` must sit on the element under the pointer, so it
 * is repeated on the child containers — the buttons themselves stay
 * clickable because the attribute is not on them.
 */
export const TitleBar = () => {
  const navigate = useNavigate();

  return (
    <header
      data-tauri-drag-region
      className="th-bg-app flex h-11 shrink-0 select-none items-center justify-between px-4"
    >
      <div data-tauri-drag-region className="flex items-center gap-1.5">
        <TrafficLights />
        <span data-tauri-drag-region className="w-3" aria-hidden />
        <button
          type="button"
          aria-label="后退"
          title="后退"
          onClick={() => navigate(-1)}
          className="flex h-7 w-7 items-center justify-center rounded-md th-text-muted transition-colors hover:bg-[var(--th-sf-05)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="前进"
          title="前进"
          onClick={() => navigate(1)}
          className="flex h-7 w-7 items-center justify-center rounded-md th-text-hint transition-colors hover:bg-[var(--th-sf-05)]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Window controls as traffic lights; glyphs appear on hover (macOS style). */
const TrafficLights = () => {
  if (!isTauri) {
    // Plain browser preview: decorative dots only.
    return (
      <div className="flex items-center gap-1.5" aria-hidden>
        <Dot color="var(--th-traffic-close)" />
        <Dot color="var(--th-traffic-min)" />
        <Dot color="var(--th-traffic-max)" />
      </div>
    );
  }

  const win = getCurrentWindow();
  return (
    <div className="flex items-center gap-1.5">
      <Light
        label="关闭"
        color="var(--th-traffic-close)"
        glyph={<GlyphX />}
        onClick={() => void win.close()}
      />
      <Light
        label="最小化"
        color="var(--th-traffic-min)"
        glyph={<GlyphMinus />}
        onClick={() => void win.minimize()}
      />
      <Light
        label="最大化"
        color="var(--th-traffic-max)"
        glyph={<GlyphPlus />}
        onClick={() => void win.toggleMaximize()}
      />
    </div>
  );
};

const Dot = ({ color }: { color: string }) => (
  <span
    className="h-3 w-3 rounded-full"
    style={{ backgroundColor: color }}
  />
);

interface LightProps {
  label: string;
  color: string;
  glyph: React.ReactNode;
  onClick: () => void;
}

const Light = ({ label, color, glyph, onClick }: LightProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="group flex h-3 w-3 items-center justify-center rounded-full"
    style={{ backgroundColor: color }}
  >
    <span className="text-[9px] font-bold leading-none text-black/55 opacity-0 transition-opacity group-hover:opacity-100">
      {glyph}
    </span>
  </button>
);

/* Glyphs sized to fit a 12px dot. */
const GlyphX = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
    <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const GlyphMinus = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
    <path d="M1.5 4h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const GlyphPlus = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
    <path d="M4 1.5v5M1.5 4h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
