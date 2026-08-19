import { useLocation } from "react-router-dom";
import { Card } from "@githelm/ui";
import { PageHeader } from "../components/domain/PageHeader";

/**
 * Pages present in the design's sidebar (githelm.pen) but without a
 * dedicated mock yet — 邮件 / 任务 / 备份. They render a consistent
 * shell so navigation stays complete while the features are built out.
 */

const COPY: Record<string, { title: string; desc: string; hint: string }> = {
  "/email": {
    title: "邮件",
    desc: "管理事务性邮件与发件通道",
    hint: "邮件通道配置即将上线。接入后,部署通知与告警将通过此处配置的发件人送达。",
  },
  "/tasks": {
    title: "任务",
    desc: "后台任务队列与执行历史",
    hint: "任务中心即将上线。构建、备份与证书续期等后台任务将在此排队与展示。",
  },
  "/backup": {
    title: "备份",
    desc: "数据备份与恢复",
    hint: "备份管理即将上线。将支持项目配置与数据卷的定时快照与一键恢复。",
  },
};

export const ComingSoonPage = () => {
  const { pathname } = useLocation();
  const copy = COPY[pathname] ?? {
    title: "敬请期待",
    desc: "",
    hint: "该功能正在开发中。",
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <PageHeader title={copy.title} description={copy.desc} />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-8 pb-8 pt-5">
        <Card className="flex max-w-[420px] flex-col items-center gap-2 rounded-2xl px-8 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--th-sf-05)] text-base">
            🚧
          </span>
          <h2 className="text-sm font-semibold th-text-strong">即将上线</h2>
          <p className="text-[13px] leading-relaxed th-text-muted">{copy.hint}</p>
        </Card>
      </div>
    </div>
  );
};
