import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { OverviewPage } from "./routes/Overview";
import { ProjectsPage } from "./routes/Projects";
import { ProjectDetailPage } from "./routes/ProjectDetail";
import { DeploymentsPage } from "./routes/Deployments";
import { ServersPage } from "./routes/Servers";
import { LogsPage } from "./routes/Logs";
import { SettingsPage } from "./routes/Settings";
import { useThemeStore } from "./stores/theme";
import { applyThemeToDocument } from "./lib/theme";
import { useAutoUpdate } from "./hooks/useAutoUpdate";

export const App = () => {
  const theme = useThemeStore((s) => s.theme);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  useAutoUpdate();

  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    // Listen for OS theme changes when in 'system' mode.
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => useThemeStore.getState().syncSystemTheme();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="deployments" element={<DeploymentsPage />} />
          <Route path="servers" element={<ServersPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};