import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/** Payload of the Rust-side `deploy-status` event. */
export interface DeployStatusEvent {
  deploymentId: string;
  status:
    | "queued"
    | "building"
    | "deploying"
    | "live"
    | "failed"
    | "cancelled"
    | "rolled-back";
  projectName: string;
}

/**
 * Subscribes to deploy progress once per app, replacing the old 2s polling:
 * every status transition invalidates the affected queries, and terminal
 * states fire an OS notification while the window is hidden (the user is
 * likely watching when it is visible).
 */
export const useDeployEvents = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let alive = true;
    const unlisten = listen<DeployStatusEvent>("deploy-status", (e) => {
      if (!alive) return;
      // Prefix keys match ["deployments"], ["projects"] and ["project", id].
      void queryClient.invalidateQueries({ queryKey: ["deployments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project"] });
      const { status, projectName } = e.payload;
      if (
        (status === "live" || status === "failed" || status === "cancelled") &&
        document.hidden
      ) {
        void notifyDeploy(status, projectName);
      }
    });
    return () => {
      alive = false;
      void unlisten.then((off) => off());
    };
  }, [queryClient]);
};

async function notifyDeploy(status: DeployStatusEvent["status"], projectName: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
    if (!granted) return;
    sendNotification({
      title:
        status === "live"
          ? "部署完成"
          : status === "failed"
            ? "部署失败"
            : "部署已取消",
      body:
        status === "live"
          ? `「${projectName}」已成功上线。`
          : status === "failed"
            ? `「${projectName}」部署失败，请查看日志。`
            : `「${projectName}」的部署已取消。`,
    });
  } catch {
    // Notifications are best-effort; never break the UI over them.
  }
}
