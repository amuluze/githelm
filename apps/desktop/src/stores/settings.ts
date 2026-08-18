import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SettingsState {
  autoUpdate: boolean;
  setAutoUpdate: (autoUpdate: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoUpdate: true,
      setAutoUpdate: (autoUpdate) => set({ autoUpdate }),
    }),
    {
      name: "githelm.settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ autoUpdate: s.autoUpdate }),
    },
  ),
);
