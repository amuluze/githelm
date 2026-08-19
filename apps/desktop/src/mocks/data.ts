import type {
  Deployment,
  Issue,
  LogEntry,
  Project,
  Server,
} from "@githelm/core";

/**
 * The mock dataset was removed — the app starts empty and every page shows
 * its designed empty state until the real backend lands. The exports stay so
 * the browser fallback in `lib/api.ts` keeps its shape; the library page
 * reads its GitHub data through the real commands.
 */

export const mockProjects: Project[] = [];

export const mockDeployments: Deployment[] = [];

export const mockServers: Server[] = [];

export const mockIssues: Issue[] = [];

export const generateMockLogs = (_count = 60): LogEntry[] => [];
