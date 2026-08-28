/**
 * Thin wrapper around Tauri's `invoke()` that adds typing and a unified error
 * shape. In production these would hit Rust commands backed by a real local
 * API. In dev we still call Tauri but the Rust side serves mock data — the
 * renderer doesn't need to know which.
 *
 * Falls back to the in-memory mock dataset when running in a plain browser
 * (e.g. `pnpm dev` without `tauri dev`), so the UI is reviewable on its own.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  AddServerInput,
  CreateProjectInput,
  Deployment,
  GithubStatus,
  Issue,
  LogEntry,
  Project,
  RepoAccount,
  GitRepo,
  Server,
  ServerDirListing,
  UpdateProjectConfigInput,
  UpdateServerInput,
  UpdateStatus,
} from "@githelm/core";
import {
  mockDeployments,
  mockIssues,
  mockProjects,
  mockServers,
  generateMockLogs,
} from "../mocks/data";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  if (!isTauri) {
    return fallback<T>(cmd, args);
  }
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    if (err instanceof Error) {
      throw new ApiError(err.message);
    }
    throw new ApiError(String(err));
  }
};

/**
 * Browser-only fallback so the UI can be developed without a Rust backend.
 * Each branch mirrors the Rust command's contract.
 */
const fallback = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  switch (cmd) {
    case "list_projects":
      return mockProjects as unknown as T;
    case "get_project": {
      const id = (args?.id as string | undefined) ?? "";
      return (mockProjects.find((p) => p.id === id) ?? null) as unknown as T;
    }
    case "list_deployments": {
      const projectId = args?.projectId as string | undefined;
      return (
        projectId
          ? mockDeployments.filter((d) => d.projectId === projectId)
          : mockDeployments
      ) as unknown as T;
    }
    case "list_servers":
      return mockServers as unknown as T;
    case "list_issues":
      return mockIssues as unknown as T;
    case "list_logs": {
      const targetId = args?.targetId as string | undefined;
      const logs = generateMockLogs();
      return (targetId ? logs.filter((l) => l.targetId === targetId) : logs) as unknown as T;
    }
    case "check_for_update":
      return {
        currentVersion: "0.1.0",
        latestVersion: null,
        updateAvailable: false,
      } as unknown as T;
    case "github_status":
      // Browser dev has no keychain / gh CLI — show the connect card.
      return { connected: false, login: null, source: null } as unknown as T;
    case "list_repo_accounts":
    case "list_github_repos":
      return [] as unknown as T;
    default:
      throw new ApiError(`Mock backend has no handler for "${cmd}"`, "NOT_MOCKED");
  }
};

export const api = {
  // ── Projects ─────────────────────────────────────────────────────────
  listProjects: () => call<Project[]>("list_projects"),
  getProject: (id: string) => call<Project | null>("get_project", { id }),
  createProject: (input: CreateProjectInput) =>
    call<Project>("create_project", { input }),
  /** Saves deploy pipeline config and returns the refreshed project. */
  updateProjectConfig: (input: UpdateProjectConfigInput) =>
    call<Project>("update_project_config", { input }),

  // ── Deployments ──────────────────────────────────────────────────────
  listDeployments: (projectId?: string) =>
    call<Deployment[]>("list_deployments", { projectId: projectId ?? null }),
  getDeployment: (id: string) =>
    call<Deployment | null>("get_deployment", { id }),
  /** Starts the pipeline (local build & push → SSH update) and returns the
   *  building record; progress lands in the logs under the deployment id. */
  deployProject: (projectId: string) =>
    call<Deployment>("deploy_project", { projectId }),
  /** Stops a running pipeline: kills the current command and records the
   *  deployment as cancelled. Errors when it is no longer running. */
  cancelDeployment: (deploymentId: string) =>
    call<void>("cancel_deployment", { deploymentId }),

  // ── Servers ──────────────────────────────────────────────────────────
  listServers: () => call<Server[]>("list_servers"),
  addServer: (input: AddServerInput) => call<Server>("add_server", { input }),
  updateServer: (input: UpdateServerInput) =>
    call<Server>("update_server", { input }),
  removeServer: (id: string) => call<void>("remove_server", { id }),
  testServerConnection: (id: string) =>
    call<{ ok: boolean; latencyMs: number }>("test_server_connection", { id }),
  /** Lists a directory on the server for the deploy-dir picker. */
  listServerDir: (id: string, path?: string) =>
    call<ServerDirListing>("list_server_dir", { id, path: path ?? null }),

  // ── Issues (background checker) ─────────────────────────────────────
  listIssues: () => call<Issue[]>("list_issues"),

  // ── GitHub import ────────────────────────────────────────────────────
  githubStatus: () => call<GithubStatus>("github_status"),
  saveGithubToken: (token: string) =>
    call<GithubStatus>("save_github_token", { token }),
  clearGithubToken: () => call<GithubStatus>("clear_github_token"),
  listRepoAccounts: () => call<RepoAccount[]>("list_repo_accounts"),
  listGithubRepos: (owner?: string) =>
    call<GitRepo[]>("list_github_repos", { owner: owner ?? null }),
  listGithubBranches: (owner: string, repo: string) =>
    call<string[]>("list_github_branches", { owner, repo }),

  // ── Logs ──────────────────────────────────────────────────────────────
  listLogs: (targetId?: string, limit = 100) =>
    call<LogEntry[]>("list_logs", {
      targetId: targetId ?? null,
      limit,
    }),

  // ── SSH terminal (PTY) ────────────────────────────────────────────────
  /** Spawns an interactive `ssh` PTY; output arrives via the
   *  `terminal-output` event (base64), exit via `terminal-exit`. */
  terminalOpen: (serverId: string) =>
    call<void>("terminal_open", { serverId }),
  terminalWrite: (serverId: string, data: string) =>
    call<void>("terminal_write", { serverId, data }),
  terminalResize: (serverId: string, cols: number, rows: number) =>
    call<void>("terminal_resize", { serverId, cols, rows }),
  terminalClose: (serverId: string) =>
    call<void>("terminal_close", { serverId }),

  // ── Secrets (keyring) ───────────────────────────────────────────────
  saveSecret: (key: string, value: string) =>
    call<void>("save_secret", { key, value }),
  deleteSecret: (key: string) => call<void>("delete_secret", { key }),
  /** Never returns the secret value to the renderer. */
  hasSecret: (key: string) => call<boolean>("has_secret", { key }),

  // ── App metadata ────────────────────────────────────────────────────
  getAppVersion: () => call<{ version: string; tauri: string }>("get_app_version"),

  // ── App updates ────────────────────────────────────────────────────
  checkForUpdate: () => call<UpdateStatus>("check_for_update"),
  installUpdate: () => call<void>("install_update"),
  restartApp: () => call<void>("restart_app"),
};