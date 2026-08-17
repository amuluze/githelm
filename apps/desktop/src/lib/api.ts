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
  Deployment,
  LogEntry,
  Project,
  Server,
  TriggerDeploymentInput,
} from "@githelm/core";
import {
  mockDeployments,
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
    case "list_logs": {
      const targetId = args?.targetId as string | undefined;
      const logs = generateMockLogs();
      return (targetId ? logs.filter((l) => l.targetId === targetId) : logs) as unknown as T;
    }
    default:
      throw new ApiError(`Mock backend has no handler for "${cmd}"`, "NOT_MOCKED");
  }
};

export const api = {
  // ── Projects ─────────────────────────────────────────────────────────
  listProjects: () => call<Project[]>("list_projects"),
  getProject: (id: string) => call<Project | null>("get_project", { id }),

  // ── Deployments ──────────────────────────────────────────────────────
  listDeployments: (projectId?: string) =>
    call<Deployment[]>("list_deployments", { projectId: projectId ?? null }),
  getDeployment: (id: string) =>
    call<Deployment | null>("get_deployment", { id }),
  triggerDeployment: (input: TriggerDeploymentInput) =>
    call<Deployment>("trigger_deployment", { input }),

  // ── Servers ──────────────────────────────────────────────────────────
  listServers: () => call<Server[]>("list_servers"),
  addServer: (input: AddServerInput) => call<Server>("add_server", { input }),
  removeServer: (id: string) => call<void>("remove_server", { id }),
  testServerConnection: (id: string) =>
    call<{ ok: boolean; latencyMs: number }>("test_server_connection", { id }),

  // ── Logs ──────────────────────────────────────────────────────────────
  listLogs: (targetId?: string, limit = 100) =>
    call<LogEntry[]>("list_logs", {
      targetId: targetId ?? null,
      limit,
    }),

  // ── Secrets (keyring) ───────────────────────────────────────────────
  saveSecret: (key: string, value: string) =>
    call<void>("save_secret", { key, value }),
  deleteSecret: (key: string) => call<void>("delete_secret", { key }),
  /** Never returns the secret value to the renderer. */
  hasSecret: (key: string) => call<boolean>("has_secret", { key }),

  // ── App metadata ────────────────────────────────────────────────────
  getAppVersion: () => call<{ version: string; tauri: string }>("get_app_version"),
};