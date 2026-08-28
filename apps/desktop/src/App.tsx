import { lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { useAutoUpdate } from "./hooks/useAutoUpdate";
import { applyThemeToDocument } from "./lib/theme";
import { useThemeStore } from "./stores/theme";

// Route modules are code-split: the shell boots without xterm (~200kB) and
// the heavy library/deploy pages. Named exports are remapped to default so
// React.lazy can consume them.
const OverviewPage = lazy(() =>
  import("./routes/Overview").then(m => ({ default: m.OverviewPage })));
const ProjectsPage = lazy(() =>
  import("./routes/Projects").then(m => ({ default: m.ProjectsPage })));
const ProjectDetailPage = lazy(() =>
  import("./routes/ProjectDetail").then(m => ({ default: m.ProjectDetailPage })));
const DeploymentsPage = lazy(() =>
  import("./routes/Deployments").then(m => ({ default: m.DeploymentsPage })));
const IssuesPage = lazy(() =>
  import("./routes/Issues").then(m => ({ default: m.IssuesPage })));
const ServersPage = lazy(() =>
  import("./routes/Servers").then(m => ({ default: m.ServersPage })));
const TerminalPage = lazy(() =>
  import("./routes/Terminal").then(m => ({ default: m.TerminalPage })));
const LogsPage = lazy(() =>
  import("./routes/Logs").then(m => ({ default: m.LogsPage })));
const LibraryPage = lazy(() =>
  import("./routes/Library").then(m => ({ default: m.LibraryPage })));
const ComingSoonPage = lazy(() =>
  import("./routes/ComingSoon").then(m => ({ default: m.ComingSoonPage })));
const SettingsPage = lazy(() =>
  import("./routes/Settings").then(m => ({ default: m.SettingsPage })));

export function App() {
  const theme = useThemeStore(s => s.theme);
  const resolvedTheme = useThemeStore(s => s.resolvedTheme);
  useAutoUpdate();

  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    // Listen for OS theme changes when in 'system' mode.
    if (theme !== "system")
      return;
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
          <Route path="issues" element={<IssuesPage />} />
          <Route path="servers" element={<ServersPage />} />
          <Route path="terminal" element={<TerminalPage />} />
          <Route path="terminal/:serverId" element={<TerminalPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="email" element={<ComingSoonPage />} />
          <Route path="tasks" element={<ComingSoonPage />} />
          <Route path="backup" element={<ComingSoonPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
