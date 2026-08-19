import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Asterisk,
  BookOpen,
  Boxes,
  Bug,
  ChevronDown,
  Ellipsis,
  ExternalLink,
  FolderUp,
  GitBranch,
  Github,
  Globe,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Plus,
  Search,
  Shield,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CreateProjectInput,
  GithubStatus,
  GitRepo,
  Provider,
  RepoAccount,
} from "@githelm/core";
import { createProjectSchema, formatRelativeTime } from "@githelm/core";
import { api, ApiError } from "../lib/api";
import { RepoEmptyIllustration } from "../components/domain/Illustrations";

/**
 * 新建项目 — mirrors library-mock / library-mock-list in githelm.pen.
 * The GitHub tab lists real repositories through the Rust-side GitHub client
 * (keychain PAT or the host's gh CLI); the Git URL tab parses a pasted
 * remote. Both paths land on the same create-project dialog.
 */

type SourceTab = "folder" | "github" | "url" | "template" | "server";
type Visibility = "all" | "public" | "private";
type SortKey = "recent" | "name";

/** Prefill for the create-project dialog, derived from a repo or a URL. */
interface CreateDraft {
  provider: Provider;
  name: string;
  repository: string;
  branch: string;
  /** Set when the repository is a GitHub `owner/name` — enables the branch dropdown. */
  owner?: string;
}

const TABS: Array<{
  key: SourceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "folder", label: "文件夹", icon: FolderUp },
  { key: "github", label: "GitHub", icon: Github },
  { key: "url", label: "Git URL", icon: Link2 },
  { key: "template", label: "模板", icon: Sparkles },
  { key: "server", label: "Existing server", icon: Boxes },
];

/** Each account chip gets a solid avatar with its own glyph (githelm.pen). */
const ACCOUNT_STYLE: Array<{
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  { icon: Asterisk, color: "var(--th-accent)" },
  { icon: Bug, color: "var(--th-danger-fg)" },
  { icon: Globe, color: "var(--th-info-fg)" },
];

const PROVIDER_LABEL: Record<Provider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  local: "自托管",
};

export const LibraryPage = () => {
  const [tab, setTab] = useState<SourceTab>("github");
  const [draft, setDraft] = useState<CreateDraft | null>(null);

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium th-text-title">新建项目</h1>
          <p className="text-[13px] th-text-secondary">
            导入仓库、粘贴 URL 或从模板开始
          </p>
        </div>
        <button
          type="button"
          aria-label="更多操作"
          className="th-bd-default th-bg-card th-text-secondary flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:th-text-strong"
        >
          <Ellipsis className="h-4 w-4" />
        </button>
      </header>

      <div className="flex items-center gap-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              tab === key
                ? "flex items-center gap-2 rounded-lg bg-[var(--th-accent)] px-4 py-2 text-sm font-medium text-[var(--th-on-accent)]"
                : "th-text-secondary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:th-text-strong"
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
        {tab === "github" ? (
          <GithubTab onCreate={setDraft} />
        ) : tab === "url" ? (
          <UrlTab onCreate={setDraft} />
        ) : (
          <SourcePlaceholder tab={tab} />
        )}
      </div>

      {draft && <CreateProjectDialog draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
};

// ── GitHub tab ───────────────────────────────────────────────────────────

const GithubTab = ({ onCreate }: { onCreate: (draft: CreateDraft) => void }) => {
  const [account, setAccount] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const status = useQuery({ queryKey: ["github-status"], queryFn: api.githubStatus });
  const connected = !!status.data?.connected;
  const accounts = useQuery({
    queryKey: ["repo-accounts"],
    queryFn: api.listRepoAccounts,
    enabled: connected,
  });
  const repos = useQuery({
    queryKey: ["github-repos", account],
    queryFn: () => api.listGithubRepos(account ?? undefined),
    enabled: connected,
  });

  const filtered = useMemo(() => {
    let list = repos.data ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q),
      );
    }
    if (visibility === "public") list = list.filter((r) => !r.private);
    if (visibility === "private") list = list.filter((r) => r.private);
    return [...list].sort((a, b) =>
      sort === "recent"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.name.localeCompare(b.name),
    );
  }, [repos.data, search, visibility, sort]);

  if (status.isLoading) {
    return (
      <section className="th-card flex flex-1 items-center justify-center text-sm th-text-muted">
        正在检查 GitHub 连接…
      </section>
    );
  }

  if (!connected) {
    return (
      <ConnectCard
        error={
          status.isError
            ? status.error instanceof ApiError
              ? status.error.message
              : "GitHub 连接状态检查失败"
            : undefined
        }
      />
    );
  }

  const filterActive = !!search.trim() || visibility !== "all";

  return (
    <>
      <section className="th-bd-default th-bg-card flex min-w-0 flex-1 flex-col rounded-2xl border">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {(accounts.data ?? []).map((acc, i) => (
              <AccountChip
                key={acc.id}
                account={acc}
                style={ACCOUNT_STYLE[i % ACCOUNT_STYLE.length]}
                active={account === acc.login}
                onClick={() =>
                  setAccount(account === acc.login ? null : acc.login)
                }
              />
            ))}
            {accounts.isLoading && (
              <span className="flex items-center gap-1.5 px-2 text-xs th-text-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                正在加载账户…
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="th-bg-card-2 th-bd-default flex min-w-[220px] flex-1 items-center gap-2.5 rounded-xl border px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 th-text-secondary" />
              <input
                type="search"
                placeholder="搜索仓库..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:th-text-muted"
              />
            </div>

            <div className="th-bg-card-2 th-bd-default flex gap-0.5 rounded-xl border p-0.5">
              {(
                [
                  ["all", "全部"],
                  ["public", "公开"],
                  ["private", "私有"],
                ] as Array<[Visibility, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVisibility(key)}
                  className={
                    visibility === key
                      ? "rounded-lg bg-[var(--th-accent)] px-3.5 py-2 text-xs font-medium text-[var(--th-on-accent)]"
                      : "th-text-secondary rounded-lg px-3.5 py-2 text-xs font-medium transition-colors hover:th-text-strong"
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSort(sort === "recent" ? "name" : "recent")}
              className="th-bg-card-2 th-bd-default th-text-strong flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium"
            >
              {sort === "recent" ? "最近" : "名称"}
              <ChevronDown className="h-3.5 w-3.5 th-text-secondary" />
            </button>
          </div>
        </div>

        <div className="h-px bg-[var(--th-divider)]" />

        <div className="min-h-0 flex-1 overflow-auto">
          {repos.isLoading ? (
            <RepoSkeleton />
          ) : repos.isError ? (
            <RepoErrorState
              message={
                repos.error instanceof ApiError
                  ? repos.error.message
                  : "仓库列表加载失败"
              }
              onRetry={() => void repos.refetch()}
            />
          ) : filtered.length === 0 ? (
            <RepoEmptyState filtered={filterActive} />
          ) : (
            filtered.map((repo) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                onClick={() => onCreate(draftFromRepo(repo))}
              />
            ))
          )}
        </div>
      </section>

      {status.data && <LibraryAside repos={repos.data ?? []} status={status.data} />}
    </>
  );
};

/** Not connected: PAT paste form, plus a pointer at `gh auth login`. */
const ConnectCard = ({ error }: { error?: string }) => {
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");

  const connect = useMutation({
    mutationFn: () => api.saveGithubToken(token),
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: ["github-status"] });
      void queryClient.invalidateQueries({ queryKey: ["repo-accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      toast.success(`GitHub 已连接（@${next.login}）`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "连接 GitHub 失败"),
  });

  return (
    <section className="th-card flex flex-1 items-center justify-center">
      <div className="flex w-full max-w-md flex-col gap-4 p-2">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="th-bg-card-2 flex h-11 w-11 items-center justify-center rounded-xl">
            <Github className="h-5 w-5 th-text-strong" />
          </div>
          <h3 className="text-base font-semibold th-text-title">连接 GitHub</h3>
          <p className="text-[13px] leading-relaxed th-text-secondary">
            粘贴一个具有 repo 与 read:org 权限的个人访问令牌；若已通过
            gh CLI 登录（gh auth login），Githelm 会自动使用其凭据。
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-[var(--th-danger-bg)] px-3 py-2 text-xs text-[var(--th-danger-fg)]">
            {error}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            connect.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_… / github_pat_…"
            className="th-input"
          />
          <div className="flex items-center justify-between gap-3">
            <a
              href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=Githelm"
              target="_blank"
              rel="noreferrer"
              className="th-link flex items-center gap-1 text-xs"
            >
              新建令牌
              <ExternalLink className="h-3 w-3" />
            </a>
            <button
              type="submit"
              disabled={connect.isPending || token.trim().length === 0}
              className="th-btn th-btn-primary px-4"
            >
              {connect.isPending ? "连接中…" : "连接"}
            </button>
          </div>
        </form>

        <p className="text-center text-[11px] th-text-hint">
          令牌仅存入系统钥匙串，不会返回给界面进程。
        </p>
      </div>
    </section>
  );
};

const draftFromRepo = (repo: GitRepo): CreateDraft => ({
  provider: "github",
  name: repo.name,
  repository: `${repo.owner}/${repo.name}`,
  branch: repo.defaultBranch || "main",
  owner: repo.owner,
});

const AccountChip = ({
  account,
  style,
  active,
  onClick,
}: {
  account: RepoAccount;
  style: { icon: React.ComponentType<{ className?: string }>; color: string };
  active: boolean;
  onClick: () => void;
}) => {
  const Icon = style.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`th-bd-default flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 transition-colors ${
        active ? "bg-[var(--th-sf-05)]" : "th-bg-card hover:bg-[var(--th-sf-03)]"
      }`}
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--th-on-accent)]"
        style={{ backgroundColor: style.color }}
      >
        <Icon className="h-[11px] w-[11px]" />
      </span>
      <span className="text-[13px] font-medium th-text-strong">{account.login}</span>
    </button>
  );
};

const RepoRow = ({ repo, onClick }: { repo: GitRepo; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    title="导入此仓库"
    className="group flex w-full cursor-pointer items-center gap-3 border-b border-[var(--th-divider)] px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--th-sf-03)]"
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--th-on-04)]">
      {repo.private ? (
        <Lock className="h-4 w-4 th-text-secondary" />
      ) : (
        <Globe className="h-4 w-4 th-text-secondary" />
      )}
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5">
        <span className="text-sm font-semibold th-text-strong">{repo.name}</span>
        {repo.private && (
          <span className="rounded-md bg-[var(--th-on-05)] px-1.5 py-px text-[11px] th-text-muted">
            私有
          </span>
        )}
      </span>
      <span className="mt-[3px] block truncate text-xs th-text-muted">
        {repo.description ?? "—"} ·{" "}
        {formatRelativeTime(repo.updatedAt, new Date(), "zh")}
      </span>
    </span>
    {repo.language && (
      <span className="flex shrink-0 items-center gap-1.5 text-xs th-text-secondary">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: repo.languageColor ?? "var(--th-on-10)" }}
        />
        {repo.language}
      </span>
    )}
    <ArrowRight className="h-4 w-4 shrink-0 th-text-hint" />
  </button>
);

const RepoSkeleton = () => (
  <div className="flex flex-col">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="flex items-center gap-3 border-b border-[var(--th-divider)] px-5 py-3 last:border-b-0"
      >
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-[10px] bg-[var(--th-on-04)]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="h-3 w-32 animate-pulse rounded bg-[var(--th-on-04)]" />
          <div className="h-2.5 w-56 animate-pulse rounded bg-[var(--th-on-04)]" />
        </div>
      </div>
    ))}
  </div>
);

const RepoErrorState = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) => (
  <div className="flex h-full flex-col items-center justify-center gap-3.5">
    <RepoEmptyIllustration />
    <h3 className="text-lg font-medium th-text-title">仓库列表加载失败</h3>
    <p className="max-w-[360px] text-center text-[13px] th-text-muted">{message}</p>
    <button type="button" onClick={onRetry} className="th-btn th-btn-soft px-4 py-2">
      重试
    </button>
  </div>
);

/** Empty state for the GitHub tab — mirrors library-mock's "未找到仓库". */
const RepoEmptyState = ({ filtered }: { filtered: boolean }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3.5">
    <RepoEmptyIllustration />
    <h3 className="text-lg font-medium th-text-title">
      {filtered ? "未找到匹配的仓库" : "未找到仓库"}
    </h3>
    <p className="text-[13px] th-text-muted">
      {filtered ? "换个关键词，或切换可见性过滤" : "此账户尚无任何仓库"}
    </p>
  </div>
);

/** Right-hand column: connection, overview stats and tip cards. */
const LibraryAside = ({ repos, status }: { repos: GitRepo[]; status: GithubStatus }) => {
  const queryClient = useQueryClient();
  const disconnect = useMutation({
    mutationFn: api.clearGithubToken,
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: ["github-status"] });
      void queryClient.invalidateQueries({ queryKey: ["repo-accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      toast.success(
        next.connected ? "已移除保存的令牌（gh CLI 仍保持连接）" : "已断开 GitHub 连接",
      );
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "断开连接失败"),
  });

  const pub = repos.filter((r) => !r.private).length;
  const viaToken = status.source === "token";
  return (
    <aside className="flex w-[268px] shrink-0 flex-col gap-4 overflow-y-auto">
      <section className="th-bd-default th-bg-card flex flex-col gap-4 rounded-2xl border p-5">
        <div className="flex items-center gap-2">
          <Github className="h-4 w-4 th-text-secondary" />
          <span className="text-sm font-semibold th-text-strong">连接</span>
        </div>
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="th-bg-card-2 flex h-9 w-9 items-center justify-center rounded-lg">
              {viaToken ? (
                <KeyRound className="h-4 w-4 th-text-muted" />
              ) : (
                <Terminal className="h-4 w-4 th-text-muted" />
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium th-text-strong">
                {viaToken ? "个人令牌" : "gh CLI"}
              </span>
              <span className="text-xs th-text-muted">@{status.login ?? "—"}</span>
            </div>
          </div>
          <span className="th-bg-card-2 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--th-success-fg)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--th-success-solid)]" />
            已连接
          </span>
        </div>
        {viaToken && (
          <button
            type="button"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className="th-btn th-btn-soft px-3 py-1.5 text-xs"
          >
            断开连接
          </button>
        )}
        <p className="th-bg-card-2 th-bd-default flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11px] leading-[1.5] th-text-secondary">
          <Shield className="mt-px h-3.5 w-3.5 shrink-0" />
          {viaToken
            ? "令牌保存在系统钥匙串，不会返回给界面进程。"
            : "本地库通过 gh CLI 访问 —— 在设置中管理 GitHub。"}
        </p>
      </section>

      <section className="th-bd-default th-bg-card flex flex-col gap-4 rounded-2xl border p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 th-text-secondary" />
          <span className="text-sm font-semibold th-text-strong">概览</span>
        </div>
        <StatRow
          icon={GitBranch}
          iconClass="bg-[var(--th-sf-05)] th-text-secondary"
          label="总计"
          value={repos.length}
        />
        <StatRow
          icon={Globe}
          iconClass="bg-[var(--th-info-bg)] text-[var(--th-info-fg)]"
          label="公开"
          value={pub}
        />
        <StatRow
          icon={Lock}
          iconClass="bg-[var(--th-orange-bg)] text-[var(--th-orange-fg)]"
          label="私有"
          value={repos.length - pub}
        />
      </section>

      <section className="th-bd-default th-bg-card flex flex-col gap-3 rounded-2xl border p-5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 th-text-title" />
          <span className="text-sm font-semibold th-text-strong">小提示</span>
        </div>
        <p className="text-xs leading-[1.6] th-text-secondary">
          选择任意仓库即可立即部署。可配置在每次推送时自动部署。
        </p>
      </section>
    </aside>
  );
};

const StatRow = ({
  icon: Icon,
  iconClass,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  label: string;
  value: number;
}) => (
  <div className="flex items-center gap-2.5">
    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}>
      <Icon className="h-3.5 w-3.5" />
    </div>
    <span className="text-[13px] th-text-secondary">{label}</span>
    <span className="ml-auto text-[15px] font-semibold tabular-nums th-text-title">
      {value}
    </span>
  </div>
);

// ── Git URL tab ──────────────────────────────────────────────────────────

const GIT_URL_RE = /^(?:(?:https?:\/\/)|git@)?(?:www\.)?([^/:]+)[/:]([^/]+)\/([^/#?.]+?)(?:\.git)?\/?$/;

const PROVIDER_BY_HOST: Record<string, Provider> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
};

const parseGitUrl = (raw: string): CreateDraft | null => {
  const value = raw.trim();
  if (!value) return null;
  const match = GIT_URL_RE.exec(value);
  if (!match) return null;
  const [, host, owner, name] = match;
  const provider = PROVIDER_BY_HOST[host.toLowerCase()];
  if (!provider) {
    // Self-hosted remote — keep the full URL as the repository reference.
    return { provider: "local", name, repository: value, branch: "main" };
  }
  return { provider, name, repository: `${owner}/${name}`, branch: "main", owner };
};

const UrlTab = ({ onCreate }: { onCreate: (draft: CreateDraft) => void }) => {
  const [value, setValue] = useState("");
  const parsed = useMemo(() => parseGitUrl(value), [value]);

  return (
    <section className="th-bd-default th-bg-card flex min-w-0 flex-1 flex-col rounded-2xl border">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold th-text-title">粘贴 Git URL</h2>
          <p className="text-xs th-text-muted">
            支持 HTTPS 与 SSH 地址，例如 git@github.com:acme/atlas.git。
          </p>
        </div>

        <div className="flex gap-2">
          <div className="th-bg-card-2 th-bd-default flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3.5 py-2.5">
            <Link2 className="h-4 w-4 shrink-0 th-text-secondary" />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://github.com/acme/atlas"
              className="w-full bg-transparent text-sm outline-none placeholder:th-text-muted"
            />
          </div>
          <button
            type="button"
            disabled={!parsed}
            onClick={() => parsed && onCreate(parsed)}
            className="th-btn th-btn-primary px-4"
          >
            <Plus className="h-3.5 w-3.5" />
            导入
          </button>
        </div>

        {value.trim() && !parsed && (
          <p className="text-xs text-[var(--th-danger-fg)]">
            无法识别该地址 —— 请粘贴形如 https://github.com/owner/repo 或
            git@github.com:owner/repo.git 的仓库地址。
          </p>
        )}

        {parsed && (
          <div className="th-bg-card-2 th-bd-default flex items-center gap-3 rounded-xl border px-3.5 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--th-on-04)]">
              {parsed.provider === "github" ? (
                <Github className="h-4 w-4 th-text-secondary" />
              ) : (
                <GitBranch className="h-4 w-4 th-text-secondary" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold th-text-strong">
                {parsed.repository}
              </span>
              <span className="text-xs th-text-muted">
                默认分支 {parsed.branch}
              </span>
            </span>
            <span className="shrink-0 rounded-md bg-[var(--th-on-05)] px-1.5 py-px text-[11px] th-text-muted">
              {PROVIDER_LABEL[parsed.provider]}
            </span>
          </div>
        )}
      </div>
    </section>
  );
};

// ── Create-project dialog (shared by both import paths) ──────────────────

const CreateProjectDialog = ({
  draft,
  onClose,
}: {
  draft: CreateDraft;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateProjectInput>({
    name: draft.name,
    repository: draft.repository,
    branch: draft.branch || "main",
    provider: draft.provider,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // GitHub repos get a branch dropdown; everything else falls back to a text
  // input seeded with the draft's default branch.
  const status = useQuery({ queryKey: ["github-status"], queryFn: api.githubStatus });
  const repoName = draft.repository.split("/").pop() ?? draft.repository;
  const branches = useQuery({
    queryKey: ["github-branches", draft.owner ?? "", repoName],
    queryFn: () => api.listGithubBranches(draft.owner ?? "", repoName),
    enabled:
      draft.provider === "github" && !!draft.owner && !!status.data?.connected,
    retry: false,
  });

  const create = useMutation({
    mutationFn: api.createProject,
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`项目「${project.name}」已创建`);
      onClose();
      navigate(`/projects/${project.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "创建项目失败"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = createProjectSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  };

  const branchOptions = branches.data ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal
    >
      <form onSubmit={submit} className="th-card w-full max-w-md p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold th-text-title">创建项目</h2>
            <span className="rounded-md bg-[var(--th-on-05)] px-1.5 py-px text-[11px] th-text-muted">
              {PROVIDER_LABEL[draft.provider]}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--th-sf-06)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="项目名称" error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="my-awesome-project"
              className="th-input"
            />
          </Field>

          <Field label="仓库" error={errors.repository}>
            <input
              value={form.repository}
              onChange={(e) => setForm({ ...form, repository: e.target.value })}
              placeholder="acme/atlas"
              className="th-input"
            />
          </Field>

          <Field label="分支" error={errors.branch}>
            {branchOptions.length > 0 ? (
              <select
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                className="th-input"
              >
                {!branchOptions.includes(form.branch) && (
                  <option value={form.branch}>{form.branch}</option>
                )}
                {branchOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            ) : branches.isFetching ? (
              <div className="th-input flex items-center gap-2 text-xs th-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在获取分支…
              </div>
            ) : (
              <input
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                placeholder="main"
                className="th-input"
              />
            )}
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="th-btn th-btn-soft px-3.5">
            取消
          </button>
          <button type="submit" disabled={create.isPending} className="th-btn th-btn-primary px-4">
            {create.isPending ? "创建中…" : "创建项目"}
          </button>
        </div>
      </form>
    </div>
  );
};

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium th-text-muted">{label}</span>
    {children}
    {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
  </label>
);

const SOURCE_PLACEHOLDER: Record<Exclude<SourceTab, "github" | "url">, { title: string; desc: string }> = {
  folder: { title: "从本地文件夹导入", desc: "选择一个包含 Git 仓库的本地文件夹,Githelm 会识别其构建方式。" },
  template: { title: "从模板开始", desc: "官方模板库即将上线,涵盖静态站点、API 服务与数据库等场景。" },
  server: { title: "从现有服务器导入", desc: "扫描已连接服务器上运行的服务,并将其纳管为项目。" },
};

const SourcePlaceholder = ({ tab }: { tab: Exclude<SourceTab, "github" | "url"> }) => {
  const copy = SOURCE_PLACEHOLDER[tab];
  return (
    <section className="th-card flex flex-1 flex-col items-center justify-center gap-2">
      <h3 className="text-sm font-semibold th-text-title">{copy.title}</h3>
      <p className="max-w-[360px] text-center text-[13px] leading-relaxed th-text-muted">
        {copy.desc}
      </p>
    </section>
  );
};
