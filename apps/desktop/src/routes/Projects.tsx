import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Button } from "@githelm/ui";
import { api } from "../lib/api";
import { PageHeader } from "../components/domain/PageHeader";
import { ProjectCard } from "../components/domain/ProjectCard";

const FILTERS = ["all", "running", "building", "stopped", "error"] as const;
type Filter = (typeof FILTERS)[number];

export const ProjectsPage = () => {
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const list = projects.data ?? [];
    return list.filter((p) => {
      const matchesText =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.repository.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filter === "all" || p.status === filter;
      return matchesText && matchesStatus;
    });
  }, [projects.data, search, filter]);

  return (
    <div>
      <PageHeader
        title="Projects"
        description={`${filtered.length} of ${projects.data?.length ?? 0} projects`}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New project
          </Button>
        }
      />

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border th-bd-subtle px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 th-text-muted" />
            <input
              type="search"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 bg-transparent text-sm outline-none placeholder:th-text-subtle"
            />
          </div>

          <div className="flex gap-1 rounded-md border th-bd-subtle p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={
                  filter === f
                    ? "rounded px-2.5 py-1 text-xs font-medium th-bg-elevated th-text-title shadow-sm"
                    : "rounded px-2.5 py-1 text-xs font-medium th-text-muted hover:bg-[var(--th-sf-04)]"
                }
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {projects.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-lg border th-bd-subtle bg-[var(--th-sf-03)]"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-lg border th-bd-subtle text-center">
            <p className="text-sm th-text-muted">No projects match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};