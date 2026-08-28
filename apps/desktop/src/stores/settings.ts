import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SettingsState {
  autoUpdate: boolean;
  setAutoUpdate: (autoUpdate: boolean) => void;
  /** Collapsed sidebar shows an icon rail; remembered across restarts. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      autoUpdate: true,
      setAutoUpdate: autoUpdate => set({ autoUpdate }),
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "githelm.settings",
      storage: createJSONStorage(() => localStorage),
      partialize: s => ({
        autoUpdate: s.autoUpdate,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    },
  ),
);
