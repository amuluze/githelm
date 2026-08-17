import { Outlet } from "react-router-dom";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

export const AppLayout = () => (
  <div className="flex h-dvh flex-col th-bg-app">
    <TitleBar />
    <div className="flex min-h-0 flex-1">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
        <StatusBar />
      </main>
    </div>
  </div>
);