import { useEffect } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "../stores/settings";
import { api } from "../lib/api";

export const useAutoUpdate = () => {
  const autoUpdate = useSettingsStore((s) => s.autoUpdate);

  useEffect(() => {
    if (!autoUpdate) return;
    let cancelled = false;
    api
      .checkForUpdate()
      .then((s) => {
        if (cancelled || !s.updateAvailable) return;
        toast.info(`发现新版本 v${s.latestVersion}，正在下载安装…`);
        api.installUpdate().then(
          () => {
            if (cancelled) return;
            toast.success("更新已完成，重启应用以生效", {
              action: {
                label: "重启",
                onClick: () => {
                  api.restartApp();
                },
              },
            });
          },
          () => {
            if (cancelled) return;
            toast.error("更新安装失败，请稍后重试");
          },
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [autoUpdate]);
};
