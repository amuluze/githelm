import { z } from "zod";

/* ─── Domain types ───────────────────────────────────────────────────────── */

export type ProjectStatus = "running" | "stopped" | "building" | "error" | "idle";
export type DeploymentStatus =
  | "queued"
  | "building"
  | "deploying"
  | "live"
  | "failed"
  | "cancelled"
  | "rolled-back";
export type ServerKind = "ssh" | "cloud";
export type ServerStatus = "online" | "offline" | "connecting" | "error";
export type Provider = "github" | "gitlab" | "bitbucket" | "local";

export interface Project {
  id: string;
  name: string;
  slug: string;
  repository: string;
  branch: string;
  status: ProjectStatus;
  /** Most recent deployment id, or null. */
  latestDeploymentId: string | null;
  createdAt: string;
  /** URL where the project is reachable, if deployed. */
  url: string | null;
  /** Total deployments made. */
  deploymentCount: number;
  /** Git provider icon key. */
  provider: Provider;
  /** Deploy pipeline config — null until configured in the deploy dialog. */
  localPath: string | null;
  serverId: string | null;
  deployDir: string | null;
  /** Local command that builds and pushes the image (e.g. `task push`). */
  buildCommand: string | null;
  /** Remote command run inside deployDir (e.g. compose pull + up -d). */
  updateCommand: string | null;
}

export interface Deployment {
  id: string;
  projectId: string;
  commitSha: string;
  commitMessage: string;
  author: string;
  status: DeploymentStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface Server {
  id: string;
  name: string;
  kind: ServerKind;
  host: string;
  /** Region tag for cloud servers (e.g. "us-east-1"), null for SSH. */
  region: string | null;
  status: ServerStatus;
  lastSeenAt: string;
  /** Whether the connection has a stored credential. Never returned raw. */
  hasCredential: boolean;
  /** SSH login user; null for servers created before deploy support. */
  username: string | null;
  /** SSH port (22 unless overridden). */
  port: number;
}

export interface LogEntry {
  id: string;
  /** Server or project id the entry belongs to. */
  targetId: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

export type IssueStatus = "open" | "resolved";
/** What the checker was looking at when it found the issue. */
export type IssueKind =
  | "deployment"
  | "certificate"
  | "domain"
  | "version"
  | "port";

export interface Issue {
  id: string;
  kind: IssueKind;
  status: IssueStatus;
  title: string;
  description: string;
  /** Display name of the project / server / domain it is attached to. */
  targetName: string;
  /** ISO 8601 timestamps. */
  detectedAt: string;
  resolvedAt: string | null;
}

/** A Git repository surfaced by the "new project" library (GitHub tab). */
export interface GitRepo {
  id: string;
  owner: string;
  name: string;
  description: string | null;
  private: boolean;
  /** Primary language label, e.g. "TypeScript". */
  language: string | null;
  /** CSS color for the language dot. */
  languageColor: string | null;
  updatedAt: string;
  defaultBranch: string;
  url: string | null;
}

/** An account the library can import repositories from. */
export interface RepoAccount {
  id: string;
  login: string;
  connected: boolean;
}

/** Where the GitHub credential came from ("token" = keychain PAT). */
export type GithubTokenSource = "token" | "gh-cli";

export interface GithubStatus {
  connected: boolean;
  login: string | null;
  source: GithubTokenSource | null;
}

/* ─── Zod schemas (for forms) ──────────────────────────────────────────── */

export const addServerSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  host: z.string().min(1, "Host is required"),
  kind: z.enum(["ssh", "cloud"]),
  region: z.string().optional(),
  username: z.string().min(1, "Username is required"),
  /** Plaintext credential; stored in the OS keychain and, when it is an SSH
   *  private key, offered to ssh automatically. Optional — blank means the
   *  connection relies on the host's ssh config / agent. */
  credential: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535).default(22),
});

export type AddServerInput = z.infer<typeof addServerSchema>;

/** Edits an existing server; `credential` blank = keep the stored one. */
export const updateServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required").max(60),
  host: z.string().min(1, "Host is required"),
  kind: z.enum(["ssh", "cloud"]),
  region: z.string().optional(),
  username: z.string().min(1, "Username is required"),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  credential: z.string().optional(),
});

export type UpdateServerInput = z.infer<typeof updateServerSchema>;

/** Deploy pipeline config — every field optional until the user fills it. */
export const projectConfigSchema = z.object({
  projectId: z.string().min(1),
  localPath: z.string().optional(),
  serverId: z.string().optional(),
  deployDir: z.string().optional(),
  buildCommand: z.string().optional(),
  updateCommand: z.string().optional(),
});

export type UpdateProjectConfigInput = z.infer<typeof projectConfigSchema>;

/* ─── Server directory browsing (deploy-dir picker) ─────────────────────── */

export interface ServerDirEntry {
  name: string;
  isDir: boolean;
}

export interface ServerDirListing {
  /** The path that was listed ("~" shorthand allowed — it survives `cd`). */
  path: string;
  entries: ServerDirEntry[];
}

export const createProjectSchema = z.object({
  name: z.string().min(1, "项目名称不能为空").max(60, "名称最长 60 个字符"),
  /** `owner/name` — URL forms are normalized on the Rust side. */
  repository: z.string().min(1, "仓库不能为空"),
  branch: z.string().min(1, "分支不能为空"),
  provider: z.enum(["github", "gitlab", "bitbucket", "local"]),
  url: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Rewrites a project's display fields; the repository binding is immutable. */
export const updateProjectSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1, "项目名称不能为空").max(60, "名称最长 60 个字符"),
  branch: z.string().min(1, "分支不能为空"),
  url: z.string().optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/* ─── IPC contract mirrors ──────────────────────────────────────────────── */

export interface SecretRef {
  /** Key under which the credential is stored in OS keychain. */
  key: string;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
}