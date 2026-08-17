import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Package, Rocket, Server } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@githelm/ui";
import { api } from "../lib/api";
import { PageHeader } from "../components/domain/PageHeader";
import { DeploymentRow } from "../components/domain/DeploymentRow";

export const OverviewPage = () => {
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });
  const deployments = useQuery({
    queryKey: ["deployments"],
    queryFn: () => api.listDeployments(undefined),
  });
  const servers = useQuery({
    queryKey: ["servers"],
    queryFn: api.listServers,
  });

  const projectById = new Map(
    (projects.data ?? []).map((p) => [p.id, p]),
  );

  const running = (projects.data ?? []).filter((p) => p.status === "running").length;
  const building = (projects.data ?? []).filter((p) => p.status === "building").length;
  const errored = (projects.data ?? []).filter((p) => p.status === "error").length;
  const onlineServers = (servers.data ?? []).filter((s) => s.status === "online").length;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Snapshot of your self-hosted deployments."
      />

      <div className="space-y-6 p-6">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Projects"
            value={projects.data?.length ?? 0}
            icon={Package}
            hint={`${running} running`}
          />
          <StatCard
            title="Deployments"
            value={deployments.data?.length ?? 0}
            icon={Rocket}
            hint={`${building} building now`}
          />
          <StatCard
            title="Servers"
            value={servers.data?.length ?? 0}
            icon={Server}
            hint={`${onlineServers} online`}
          />
          <StatCard
            title="Health"
            value={errored === 0 ? "OK" : `${errored} errors`}
            icon={ArrowUpRight}
            hint={
              errored === 0 ? "No projects need attention" : "Needs attention"
            }
            intent={errored === 0 ? "ok" : "danger"}
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider th-text-muted">
              Recent deployments
            </h2>
            <Link
              to="/deployments"
              className="th-link text-xs"
            >
              View all →
            </Link>
          </div>
          <Card className="overflow-hidden p-0">
            <CardContent className="p-0">
              {(deployments.data ?? []).slice(0, 6).map((d) => (
                <DeploymentRow
                  key={d.id}
                  deployment={d}
                  projectName={projectById.get(d.projectId)?.name}
                />
              ))}
              {deployments.isLoading && (
                <div className="px-4 py-8 text-center text-sm th-text-muted">
                  Loading…
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  intent?: "ok" | "danger";
}

const StatCard = ({ title, value, icon: Icon, hint, intent }: StatCardProps) => (
  <Card>
    <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
      <CardDescription className="text-xs uppercase tracking-wider">
        {title}
      </CardDescription>
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--th-sf-06)]">
        <Icon className="h-3.5 w-3.5" />
      </div>
    </CardHeader>
    <CardContent>
      <div
        className={
          intent === "danger" ? "text-2xl font-semibold text-red-500" : "text-2xl font-semibold th-text-title"
        }
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-xs th-text-muted">{hint}</p>}
    </CardContent>
  </Card>
);