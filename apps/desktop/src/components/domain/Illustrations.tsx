import {
  Database,
  Folder,
  GitBranch,
  Globe,
  Plus,
  Upload,
} from "lucide-react";

/**
 * Decorative empty-state illustrations ported 1:1 from githelm.pen
 * (layout="none" frames with absolute x/y coordinates).
 */

function Spark({
  x,
  y,
  size,
}: {
  x: number;
  y: number;
  size: number;
}) {
  return (
    <span
      aria-hidden
      className="absolute rounded-full bg-[var(--th-on-15)]"
      style={{ left: x, top: y, width: size, height: size }}
    />
  );
}

/** home-mock → orbit-illustration, 340×150: repo/domain/deploy/data around a hub. */
export function OrbitIllustration() {
  return (
    <div className="relative h-[150px] w-[340px] shrink-0" aria-hidden>
      <svg
        className="absolute inset-0"
        width={340}
        height={150}
        viewBox="0 0 340 150"
        fill="none"
      >
        <path
          d="M52 30l90 34m146-34l-90 34m-146 42l90-20m146 20l-90-20"
          stroke="var(--th-border-default)"
          strokeWidth={1}
        />
      </svg>
      <OrbitChip x={4} y={8} icon={GitBranch} label="Repo" />
      <OrbitChip x={292} y={8} icon={Globe} label="Domain" />
      <OrbitChip x={4} y={84} icon={Upload} label="Deploy" />
      <OrbitChip x={292} y={84} icon={Database} label="Data" />
      <div
        className="absolute flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          left: 146,
          top: 51,
          backgroundColor: "var(--th-accent)",
        }}
      >
        <span
          className="absolute rounded-full border-2"
          style={{
            right: -2,
            top: -2,
            width: 8,
            height: 8,
            backgroundColor: "var(--th-success-solid)",
            borderColor: "var(--th-bg-card)",
          }}
        />
      </div>
    </div>
  );
}

function OrbitChip({
  x,
  y,
  icon: Icon,
  label,
}: {
  x: number;
  y: number;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div
      className="absolute flex w-[52px] flex-col items-center gap-1"
      style={{ left: x - 4, top: y }}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border th-bd-default th-bg-card">
        <Icon className="h-[18px] w-[18px] th-text-secondary" />
      </div>
      <span className="text-[11px] th-text-hint">{label}</span>
    </div>
  );
}

/**
 * projects-mock / deployments-mock → illustration, 220×150: a browser
 * window skeleton with an add badge. Also reused by library (scaled down).
 */
export function WindowIllustration({
  scale = 1,
}: {
  scale?: number;
}) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: 220 * scale, height: 150 * scale }}
      aria-hidden
    >
      <div
        className="absolute flex flex-col rounded-xl border th-bd-default th-bg-card"
        style={{ left: 32 * scale, top: 14 * scale, width: 150 * scale }}
      >
        <div
          className="flex items-center"
          style={{ gap: 5 * scale, padding: `${10 * scale}px ${12 * scale}px` }}
        >
          <Dot color="var(--th-traffic-close)" size={7 * scale} />
          <Dot color="var(--th-traffic-min)" size={7 * scale} />
          <Dot color="var(--th-traffic-max)" size={7 * scale} />
        </div>
        <div
          className="flex flex-col"
          style={{ gap: 7 * scale, padding: `${6 * scale}px ${14 * scale}px` }}
        >
          <Bar w={64} h={6} scale={scale} />
          <Bar w={96} h={6} scale={scale} />
          <Bar w={78} h={6} scale={scale} />
          <div
            className="flex items-center justify-center"
            style={{
              width: 26 * scale,
              height: 20 * scale,
              borderRadius: 6 * scale,
              backgroundColor: "var(--th-on-05)",
            }}
          >
            <Folder
              className="th-text-muted"
              style={{ width: 12 * scale, height: 12 * scale }}
            />
          </div>
        </div>
      </div>
      <div
        className="absolute flex items-center justify-center rounded-full border th-bd-default th-bg-card"
        style={{ left: 168 * scale, top: 88 * scale, width: 34 * scale, height: 34 * scale }}
      >
        <Plus
          className="th-text-strong"
          style={{ width: 16 * scale, height: 16 * scale }}
        />
      </div>
      <Spark x={8} y={40} size={6 * scale} />
      <Spark x={204} y={24} size={5 * scale} />
      <Spark x={196} y={120} size={7 * scale} />
    </div>
  );
}

function Dot({ color, size }: { color: string; size: number }) {
  return (
    <span
      className="rounded-full"
      style={{ backgroundColor: color, width: size, height: size }}
    />
  );
}

function Bar({
  w,
  h,
  scale,
}: {
  w: number;
  h: number;
  scale: number;
}) {
  return (
    <span
      className="rounded"
      style={{
        width: w * scale,
        height: h * scale,
        backgroundColor: "var(--th-on-08)",
      }}
    />
  );
}

/** issues-mock → illustration, 280×202: skeleton checklist card with sparks. */
export function SkeletonListIllustration() {
  const bars = [
    { id: "a", width: 64 },
    { id: "b", width: 88 },
    { id: "c", width: 52 },
    { id: "d", width: 72 },
  ];
  return (
    <div className="relative h-[202px] w-[280px] shrink-0" aria-hidden>
      <div className="absolute left-[18px] top-3 flex w-[244px] flex-col rounded-xl border th-bd-default th-bg-card p-3.5">
        {bars.map(bar => (
          <div key={bar.id} className="flex items-center gap-2.5 py-1.5">
            <span className="h-[18px] w-[18px] rounded-md bg-[var(--th-on-05)]" />
            <span
              className="h-[7px] rounded bg-[var(--th-on-08)]"
              style={{ width: bar.width }}
            />
            <span className="ml-auto h-2.5 w-[30px] rounded-full bg-[var(--th-on-05)]" />
          </div>
        ))}
      </div>
      <Spark x={4} y={56} size={6} />
      <Spark x={266} y={30} size={5} />
      <Spark x={258} y={132} size={7} />
    </div>
  );
}

/** servers-mock → illustration, 280×150: stacked server units + add badge. */
export function ServerStackIllustration() {
  const units = [
    { id: "top", online: true },
    { id: "mid", online: false },
    { id: "low", online: false },
  ];
  return (
    <div className="relative h-[150px] w-[280px] shrink-0" aria-hidden>
      <div className="absolute left-[30px] top-5 flex w-[150px] flex-col gap-3 rounded-xl border th-bd-default th-bg-card p-4">
        {units.map(unit => (
          <div key={unit.id} className="flex items-center gap-2">
            <span className="h-2 w-[76px] rounded bg-[var(--th-on-08)]" />
            <span className="flex-1" />
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: unit.online
                  ? "var(--th-success-solid)"
                  : "var(--th-on-15)",
              }}
            />
          </div>
        ))}
      </div>
      <span className="absolute left-[184px] top-[74px] h-px w-[26px] bg-[var(--th-divider)]" />
      <div className="absolute left-[210px] top-[58px] flex h-[34px] w-[34px] items-center justify-center rounded-full border th-bd-default th-bg-card">
        <Plus className="h-4 w-4 th-text-strong" />
      </div>
      <Spark x={6} y={44} size={6} />
      <Spark x={262} y={16} size={5} />
      <Spark x={252} y={126} size={7} />
    </div>
  );
}

/** library-mock → library-empty-illustration, 220×140: mini browser window. */
export function RepoEmptyIllustration() {
  return (
    <div className="relative h-[140px] w-[220px] shrink-0" aria-hidden>
      <div className="absolute left-4 top-4 flex w-[144px] flex-col rounded-xl border th-bd-default th-bg-card">
        <div className="flex items-center gap-1 px-3 py-2.5">
          <Dot color="var(--th-traffic-close)" size={6} />
          <Dot color="var(--th-traffic-min)" size={6} />
          <Dot color="var(--th-traffic-max)" size={6} />
          <span className="ml-auto h-2 w-12 rounded bg-[var(--th-on-05)]" />
        </div>
        <div className="h-px bg-[var(--th-divider)]" />
        <div className="flex flex-col gap-2.5 p-3">
          {[{ id: "a", width: 96 }, { id: "b", width: 72 }, { id: "c", width: 84 }].map(bar => (
            <div key={bar.id} className="flex items-center gap-2">
              <span
                className="h-2 rounded bg-[var(--th-on-08)]"
                style={{ width: bar.width }}
              />
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--th-on-15)]" />
            </div>
          ))}
        </div>
      </div>
      <span className="absolute left-[164px] top-[68px] h-px w-5 bg-[var(--th-divider)]" />
      <div className="absolute left-[186px] top-[52px] flex h-[34px] w-[34px] items-center justify-center rounded-full border th-bd-default th-bg-card">
        <Plus className="h-4 w-4 th-text-strong" />
      </div>
      <Spark x={2} y={40} size={6} />
      <Spark x={8} y={112} size={5} />
      <Spark x={168} y={122} size={7} />
    </div>
  );
}
