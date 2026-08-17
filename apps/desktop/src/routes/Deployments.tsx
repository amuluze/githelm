import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@githelm/ui";
import { api } from "../lib/api";
import { PageHeader } from "../components/domain/PageHeader";
import { DeploymentRow } from "../components/domain/DeploymentRow";

export const DeploymentsPage = () => {
  const deployments = useQuery({
    queryKey: ["deployments"],
    queryFn: () => api.listDeployments(undefined),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  const projectById = useMemo(
    () => new Map((projects.data ?? []).map((p) => [p.id, p])),
    [projects.data],
  );

  return (
    <div>
      <PageHeader
        title="Deployments"
        description={`${deployments.data?.length ?? 0} total in the last 30 days`}
      />

      <div className="p-6">
        <Card className="overflow-hidden p-0">
          <CardContent className="p-0">
            {(deployments.data ?? []).map((d) => (
              <DeploymentRow
                key={d.id}
                deployment={d}
                projectName={projectById.get(d.projectId)?.name}
              />
            ))}
            {deployments.isLoading && (
              <div className="px-4 py-12 text-center text-sm th-text-muted">
                Loading…
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};