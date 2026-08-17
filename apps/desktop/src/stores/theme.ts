import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ResolvedTheme } from "../lib/theme";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  cycleTheme: () => void;
  syncSystemTheme: () => void;
}

const detectSystem = (): ResolvedTheme => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "system",
      resolvedTheme: detectSystem(),
      setTheme: (theme) => {
        const resolvedTheme =
          theme === "system" ? detectSystem() : theme;
        set({ theme, resolvedTheme });
      },
      cycleTheme: () => {
        const current = get().theme;
        const next: ThemeMode =
          current === "light"
            ? "dark"
            : current === "dark"
              ? "system"
              : "light";
        get().setTheme(next);
      },
      syncSystemTheme: () => {
        if (get().theme !== "system") return;
        set({ resolvedTheme: detectSystem() });
      },
    }),
    {
      name: "githelm.theme",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const resolvedTheme =
          state.theme === "system" ? detectSystem() : state.theme;
        state.resolvedTheme = resolvedTheme;
      },
    },
  ),
);