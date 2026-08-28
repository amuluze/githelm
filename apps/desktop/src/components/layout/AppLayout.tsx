import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { useDeployEvents } from "../../hooks/useDeployEvents";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";

/** Shown while a lazily-loaded route chunk streams in. */
function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin th-text-muted" />
    </div>
  );
}

/**
 * Window shell per githelm.pen: 44px title bar on top, sidebar (232px,
 * bg-card) on the left, page content (bg-page) filling the rest. The
 * rounded window corners are applied to #root in globals.css.
 */
export function AppLayout() {
  // One subscription for the whole app: query invalidation + notifications.
  useDeployEvents();

  return (
    <div className="th-bg-app flex h-dvh flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            {/* Suspense lives here so the shell stays put while a route
                chunk loads. */}
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
