import type {
  Deployment,
  LogEntry,
  Project,
  Server,
} from "@githelm/core";

/**
 * Static, deterministic mock dataset. Mirrors the kinds of records we'd expect
 * from a real openship API. Dates are picked so that relative-time formatting
 * (now → past) reads naturally regardless of when the app is opened.
 */
const NOW = Date.now();
const min = (m: number) => new Date(NOW - m * 60_000).toISOString();
const hr = (h: number) => new Date(NOW - h * 60 * 60_000).toISOString();
const day = (d: number) => new Date(NOW - d * 24 * 60 * 60_000).toISOString();

export const mockProjects: Project[] = [
  {
    id: "prj_atlas",
    name: "Atlas Web",
    slug: "atlas-web",
    repository: "acme/atlas",
    branch: "main",
    status: "running",
    latestDeploymentId: "dep_0042",
    createdAt: day(120),
    url: "https://atlas.example.com",
    deploymentCount: 142,
    provider: "github",
  },
  {
    id: "prj_blog",
    name: "Marketing Blog",
    slug: "blog",
    repository: "acme/blog",
    branch: "main",
    status: "building",
    latestDeploymentId: "dep_0041",
    createdAt: day(80),
    url: "https://blog.example.com",
    deploymentCount: 38,
    provider: "github",
  },
  {
    id: "prj_api",
    name: "Internal API",
    slug: "internal-api",
    repository: "acme/api",
    branch: "main",
    status: "running",
    latestDeploymentId: "dep_0040",
    createdAt: day(60),
    url: "https://api.internal.example.com",
    deploymentCount: 87,
    provider: "github",
  },
  {
    id: "prj_docs",
    name: "Documentation",
    slug: "docs",
    repository: "acme/docs",
    branch: "main",
    status: "stopped",
    latestDeploymentId: "dep_0038",
    createdAt: day(45),
    url: null,
    deploymentCount: 12,
    provider: "gitlab",
  },
  {
    id: "prj_legacy",
    name: "Legacy Admin",
    slug: "legacy-admin",
    repository: "acme/legacy-admin",
    branch: "main",
    status: "error",
    latestDeploymentId: "dep_0037",
    createdAt: day(200),
    url: "https://admin.legacy.example.com",
    deploymentCount: 4,
    provider: "github",
  },
  {
    id: "prj_convex",
    name: "Convex Backend",
    slug: "convex",
    repository: "acme/convex",
    branch: "main",
    status: "running",
    latestDeploymentId: "dep_0043",
    createdAt: day(15),
    url: "https://convex.example.com",
    deploymentCount: 23,
    provider: "github",
  },
];

export const mockDeployments: Deployment[] = [
  {
    id: "dep_0043",
    projectId: "prj_convex",
    commitSha: "a8f3d21",
    commitMessage: "feat: add realtime sync endpoint",
    author: "ada",
    status: "live",
    startedAt: min(8),
    finishedAt: min(6),
    durationMs: 118_000,
  },
  {
    id: "dep_0042",
    projectId: "prj_atlas",
    commitSha: "f12bc04",
    commitMessage: "fix: timezone bug in scheduler",
    author: "linus",
    status: "live",
    startedAt: min(35),
    finishedAt: min(33),
    durationMs: 92_000,
  },
  {
    id: "dep_0041",
    projectId: "prj_blog",
    commitSha: "9d11c5e",
    commitMessage: "chore: upgrade dependencies",
    author: "ada",
    status: "building",
    startedAt: min(2),
    finishedAt: null,
    durationMs: null,
  },
  {
    id: "dep_0040",
    projectId: "prj_api",
    commitSha: "7e5b889",
    commitMessage: "perf: cache invalidation v2",
    author: "grace",
    status: "live",
    startedAt: hr(2),
    finishedAt: hr(2),
    durationMs: 73_000,
  },
  {
    id: "dep_0039",
    projectId: "prj_api",
    commitSha: "3c4a921",
    commitMessage: "feat: rate-limit headers",
    author: "grace",
    status: "failed",
    startedAt: hr(4),
    finishedAt: hr(4),
    durationMs: 41_000,
  },
  {
    id: "dep_0038",
    projectId: "prj_docs",
    commitSha: "224ab10",
    commitMessage: "docs: rewrite auth guide",
    author: "linus",
    status: "live",
    startedAt: hr(8),
    finishedAt: hr(8),
    durationMs: 31_000,
  },
  {
    id: "dep_0037",
    projectId: "prj_legacy",
    commitSha: "0018f33",
    commitMessage: "fix: rollback from v2 schema",
    author: "ada",
    status: "rolled-back",
    startedAt: day(1),
    finishedAt: day(1),
    durationMs: 86_000,
  },
];

export const mockServers: Server[] = [
  {
    id: "srv_local",
    name: "Local Machine",
    kind: "ssh",
    host: "127.0.0.1",
    region: null,
    status: "online",
    lastSeenAt: min(1),
    hasCredential: true,
  },
  {
    id: "srv_prod",
    name: "prod-use1",
    kind: "ssh",
    host: "prod.example.com",
    region: null,
    status: "online",
    lastSeenAt: min(2),
    hasCredential: true,
  },
  {
    id: "srv_stage",
    name: "staging-eu",
    kind: "ssh",
    host: "staging.example.com",
    region: null,
    status: "offline",
    lastSeenAt: hr(3),
    hasCredential: true,
  },
  {
    id: "srv_cloud",
    name: "Cloud Sandbox",
    kind: "cloud",
    host: "sandbox.openship.io",
    region: "us-east-1",
    status: "online",
    lastSeenAt: min(4),
    hasCredential: false,
  },
];

const LOG_MESSAGES: Array<Omit<LogEntry, "id" | "timestamp">> = [
  { targetId: "srv_prod", level: "info", message: "Health check passed" },
  { targetId: "srv_prod", level: "info", message: "Pulling image acme/api@sha256:9d11" },
  { targetId: "srv_prod", level: "debug", message: "Starting container prism-api-0042" },
  { targetId: "srv_prod", level: "info", message: "Container started in 1.2s" },
  { targetId: "srv_prod", level: "warn", message: "Disk usage 78% on /var/lib/docker" },
  { targetId: "srv_prod", level: "info", message: "TLS certificate renewed" },
  { targetId: "srv_local", level: "info", message: "Local API responding" },
  { targetId: "srv_local", level: "error", message: "Failed to bind 127.0.0.1:7420 (in use)" },
  { targetId: "srv_local", level: "info", message: "Rebound to 127.0.0.1:7430" },
  { targetId: "srv_stage", level: "info", message: "Last seen 3 hours ago — assuming offline" },
];

export const generateMockLogs = (count = 60): LogEntry[] => {
  const out: LogEntry[] = [];
  for (let i = 0; i < count; i++) {
    const seed = LOG_MESSAGES[i % LOG_MESSAGES.length];
    out.push({
      id: `log_${i.toString().padStart(4, "0")}`,
      ...seed,
      timestamp: new Date(NOW - (count - i) * 5_000).toISOString(),
    });
  }
  return out;
};