import { Outlet } from "react-router-dom";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";

/**
 * Window shell per githelm.pen: 44px title bar on top, sidebar (232px,
 * bg-card) on the left, page content (bg-page) filling the rest. The
 * rounded window corners are applied to #root in globals.css.
 */
export const AppLayout = () => (
  <div className="th-bg-app flex h-dvh flex-col">
    <TitleBar />
    <div className="flex min-h-0 flex-1">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  </div>
);
