import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** When deploy notifications fire: always, only when hidden, or never. */
export type NotifyPolicy = "all" | "background" | "off";

interface SettingsState {
  autoUpdate: boolean;
  setAutoUpdate: (autoUpdate: boolean) => void;
  /** Collapsed sidebar shows an icon rail; remembered across restarts. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  notifyPolicy: NotifyPolicy;
  setNotifyPolicy: (policy: NotifyPolicy) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      autoUpdate: true,
      setAutoUpdate: autoUpdate => set({ autoUpdate }),
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      // Historical default: only notify while the window is hidden.
      notifyPolicy: "background",
      setNotifyPolicy: notifyPolicy => set({ notifyPolicy }),
    }),
    {
      name: "githelm.settings",
      storage: createJSONStorage(() => localStorage),
      partialize: s => ({
        autoUpdate: s.autoUpdate,
        sidebarCollapsed: s.sidebarCollapsed,
        notifyPolicy: s.notifyPolicy,
      }),
    },
  ),
);
