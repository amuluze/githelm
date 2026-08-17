import { z } from "zod";

/* ─── Domain types ───────────────────────────────────────────────────────── */

export type ProjectStatus = "running" | "stopped" | "building" | "error" | "idle";
export type DeploymentStatus =
  | "queued"
  | "building"
  | "deploying"
  | "live"
  | "failed"
  | "rolled-back";
export type ServerKind = "ssh" | "cloud";
export type ServerStatus = "online" | "offline" | "connecting" | "error";

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
  provider: "github" | "gitlab" | "bitbucket" | "local";
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

/* ─── Zod schemas (for forms) ──────────────────────────────────────────── */

export const addServerSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  host: z.string().min(1, "Host is required"),
  kind: z.enum(["ssh", "cloud"]),
  region: z.string().optional(),
  username: z.string().min(1, "Username is required"),
  /** Plaintext credential; never returned to the renderer after save. */
  credential: z.string().min(1, "Credential is required"),
});

export type AddServerInput = z.infer<typeof addServerSchema>;

export const triggerDeploymentSchema = z.object({
  projectId: z.string().min(1),
  branch: z.string().min(1),
});

export type TriggerDeploymentInput = z.infer<typeof triggerDeploymentSchema>;

/* ─── IPC contract mirrors ──────────────────────────────────────────────── */

export interface SecretRef {
  /** Key under which the credential is stored in OS keychain. */
  key: string;
}