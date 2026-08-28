import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useEffect } from "react";
import { useSettingsStore } from "../stores/settings";

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
export function useDeployEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let alive = true;
    const unlisten = listen<DeployStatusEvent>("deploy-status", (e) => {
      if (!alive)
        return;
      // Prefix keys match ["deployments"], ["projects"] and ["project", id].
      void queryClient.invalidateQueries({ queryKey: ["deployments"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project"] });
      // The log dialog's single-record query uses the singular key.
      void queryClient.invalidateQueries({
        queryKey: ["deployment", e.payload.deploymentId],
      });
      // Failures open / successes resolve issues on the Rust side — the
      // intermediate transitions never touch the issues table.
      if (e.payload.status === "live" || e.payload.status === "failed") {
        void queryClient.invalidateQueries({ queryKey: ["issues"] });
      }
      const { status, projectName } = e.payload;
      const isTerminal
        = status === "live" || status === "failed" || status === "cancelled";
      if (isTerminal && shouldNotify())
        void notifyDeploy(status, projectName);
    });
    // The background checker emits this when a scan opened or resolved an
    // issue, so the issues page and badges stay live without polling.
    const unIssues = listen("issues-changed", () => {
      if (alive)
        void queryClient.invalidateQueries({ queryKey: ["issues"] });
    });
    return () => {
      alive = false;
      void unlisten.then(off => off());
      void unIssues.then(off => off());
    };
  }, [queryClient]);
}

/**
 * Applies the 通知 policy from settings: "all" notifies regardless of
 * visibility, "background" only while the window is hidden (the user is
 * likely watching when visible), "off" never.
 */
function shouldNotify(): boolean {
  const policy = useSettingsStore.getState().notifyPolicy;
  if (policy === "off")
    return false;
  return policy === "all" || document.hidden;
}

async function notifyDeploy(status: DeployStatusEvent["status"], projectName: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
    if (!granted)
      return;
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
  }
  catch {
    // Notifications are best-effort; never break the UI over them.
  }
}
