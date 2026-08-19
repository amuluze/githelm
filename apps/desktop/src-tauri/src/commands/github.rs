//! GitHub import — repository discovery over the REST API. The credential is
//! resolved Rust-side (keychain PAT first, then the host's `gh` CLI login) and
//! never crosses to the renderer.

use keyring::Entry;
use serde::de::DeserializeOwned;
use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::types::{GitRepo, GithubStatus, GithubTokenSource, RepoAccount};

const SERVICE: &str = "io.githelm.desktop";
const GITHUB_TOKEN_KEY: &str = "github_token";
const API_BASE: &str = "https://api.github.com";
const PER_PAGE: usize = 100;
/// Cap on pagination loops (50 × 100 = 5000 items per list).
const MAX_PAGES: u32 = 50;

#[derive(Deserialize)]
struct GhUser {
    login: String,
}

#[derive(Deserialize)]
struct GhOrg {
    login: String,
}

#[derive(Deserialize)]
struct GhRepo {
    id: u64,
    name: String,
    full_name: String,
    private: bool,
    description: Option<String>,
    language: Option<String>,
    updated_at: String,
    default_branch: String,
    html_url: String,
}

#[derive(Deserialize)]
struct GhBranch {
    name: String,
}

#[derive(Deserialize)]
struct GhError {
    message: String,
}

fn keychain_token() -> Option<String> {
    let entry = Entry::new(SERVICE, GITHUB_TOKEN_KEY).ok()?;
    entry
        .get_password()
        .ok()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

/// `gh auth token` prints the host's gh CLI login, if any. Fails quietly —
/// a missing or logged-out gh just means "no credential from this source".
fn gh_cli_token() -> Option<String> {
    let out = std::process::Command::new("gh")
        .args(["auth", "token"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let token = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!token.is_empty()).then_some(token)
}

fn client_for(token: &str) -> AppResult<reqwest::Client> {
    let mut auth = reqwest::header::HeaderValue::from_str(&format!("Bearer {token}"))
        .map_err(|_| AppError::Validation("GitHub 令牌包含非法字符".into()))?;
    auth.set_sensitive(true);
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(reqwest::header::AUTHORIZATION, auth);
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/vnd.github+json"),
    );
    headers.insert(
        "X-GitHub-Api-Version",
        reqwest::header::HeaderValue::from_static("2022-11-28"),
    );
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent(concat!("githelm/", env!("CARGO_PKG_VERSION")))
        .default_headers(headers)
        .build()
        .map_err(|e| AppError::Internal(format!("http client: {e}")))
}

fn resolve_client() -> AppResult<Option<(reqwest::Client, GithubTokenSource)>> {
    if let Some(token) = keychain_token() {
        return Ok(Some((client_for(&token)?, GithubTokenSource::Token)));
    }
    if let Some(token) = gh_cli_token() {
        return Ok(Some((client_for(&token)?, GithubTokenSource::GhCli)));
    }
    Ok(None)
}

fn not_connected() -> AppError {
    AppError::Validation("尚未连接 GitHub，请先在 GitHub 标签页连接".into())
}

async fn gh_error(resp: reqwest::Response) -> AppError {
    let status = resp.status();
    let message = resp
        .json::<GhError>()
        .await
        .ok()
        .map(|e| e.message)
        .unwrap_or_default();
    match status.as_u16() {
        401 => AppError::Validation("GitHub 令牌无效或已过期".into()),
        403 => AppError::Validation(format!("GitHub 拒绝访问（可能触发了速率限制）：{message}")),
        404 => AppError::NotFound(format!("GitHub 上不存在：{message}")),
        _ => AppError::Internal(format!("GitHub API {status}：{message}")),
    }
}

async fn gh_get<T: DeserializeOwned>(client: &reqwest::Client, path: &str) -> AppResult<T> {
    let resp = client
        .get(format!("{API_BASE}{path}"))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("GitHub 请求失败：{e}")))?;
    if !resp.status().is_success() {
        return Err(gh_error(resp).await);
    }
    resp.json()
        .await
        .map_err(|e| AppError::Internal(format!("GitHub 响应解析失败：{e}")))
}

/// Walks `per_page=100` pages until a short page ends the list.
async fn gh_get_all<T: DeserializeOwned>(
    client: &reqwest::Client,
    path: &str,
    extra: &[(&str, &str)],
) -> AppResult<Vec<T>> {
    let mut out = Vec::new();
    for page in 1..=MAX_PAGES {
        let mut query: Vec<(&str, String)> = vec![
            ("per_page", PER_PAGE.to_string()),
            ("page", page.to_string()),
        ];
        query.extend(extra.iter().map(|(k, v)| (*k, (*v).to_string())));
        let resp = client
            .get(format!("{API_BASE}{path}"))
            .query(&query)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("GitHub 请求失败：{e}")))?;
        if !resp.status().is_success() {
            return Err(gh_error(resp).await);
        }
        let batch: Vec<T> = resp
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("GitHub 响应解析失败：{e}")))?;
        let fetched = batch.len();
        out.extend(batch);
        if fetched < PER_PAGE {
            break;
        }
    }
    Ok(out)
}

fn map_repo(r: GhRepo) -> GitRepo {
    let owner = r
        .full_name
        .split('/')
        .next()
        .unwrap_or_default()
        .to_string();
    GitRepo {
        id: r.id.to_string(),
        owner,
        name: r.name,
        description: r.description,
        private: r.private,
        language: r.language.clone(),
        language_color: r
            .language
            .as_deref()
            .and_then(language_color)
            .map(str::to_string),
        updated_at: r.updated_at,
        default_branch: r.default_branch,
        url: Some(r.html_url),
    }
}

/// GitHub's API returns language names but not colors; the library paints the
/// dot from this linguist-derived table and falls back to the theme dot.
fn language_color(lang: &str) -> Option<&'static str> {
    Some(match lang {
        "TypeScript" => "#3178c6",
        "JavaScript" => "#f1e05a",
        "Python" => "#3572a5",
        "Go" => "#00add8",
        "Rust" => "#dea584",
        "Java" => "#b07219",
        "Kotlin" => "#a97bff",
        "Swift" => "#f05138",
        "Dart" => "#00b4ab",
        "C" => "#555555",
        "C++" => "#f34b7d",
        "C#" => "#178600",
        "Ruby" => "#701516",
        "PHP" => "#4f5d95",
        "Shell" => "#89e051",
        "HTML" => "#e34c26",
        "CSS" => "#563d7c",
        "SCSS" => "#c6538c",
        "Less" => "#1d365d",
        "Vue" => "#41b883",
        "Svelte" => "#ff3e00",
        "Elixir" => "#6e4a7e",
        "Erlang" => "#b83998",
        "Haskell" => "#5e5086",
        "Lua" => "#000080",
        "Perl" => "#0298c3",
        "R" => "#198ce7",
        "Scala" => "#c22d40",
        "Zig" => "#ec915c",
        "Clojure" => "#db5855",
        "OCaml" => "#3be133",
        "Objective-C" => "#438eff",
        "Dockerfile" => "#384d54",
        "Makefile" => "#427819",
        "Nix" => "#7e7eff",
        "Jupyter Notebook" => "#da5b0b",
        "Markdown" => "#083fa1",
        _ => return None,
    })
}

async fn status() -> AppResult<GithubStatus> {
    let Some((client, source)) = resolve_client()? else {
        return Ok(GithubStatus {
            connected: false,
            login: None,
            source: None,
        });
    };
    let user: GhUser = gh_get(&client, "/user").await?;
    Ok(GithubStatus {
        connected: true,
        login: Some(user.login),
        source: Some(source),
    })
}

#[tauri::command]
pub async fn github_status() -> AppResult<GithubStatus> {
    status().await
}

/// Validates the PAT against /user before persisting so a typo never reaches
/// the keychain. Returns the resulting connection status.
#[tauri::command]
pub async fn save_github_token(token: String) -> AppResult<GithubStatus> {
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::Validation("GitHub 令牌不能为空".into()));
    }
    let client = client_for(token)?;
    let user: GhUser = gh_get(&client, "/user").await?;
    let entry = Entry::new(SERVICE, GITHUB_TOKEN_KEY)
        .map_err(|e| AppError::Internal(format!("keyring: {e}")))?;
    entry
        .set_password(token)
        .map_err(|e| AppError::Internal(format!("keyring set: {e}")))?;
    Ok(GithubStatus {
        connected: true,
        login: Some(user.login),
        source: Some(GithubTokenSource::Token),
    })
}

/// Drops the keychain PAT. A gh CLI login (if present) keeps the app
/// connected, so the response reports the recomputed status.
#[tauri::command]
pub async fn clear_github_token() -> AppResult<GithubStatus> {
    if let Ok(entry) = Entry::new(SERVICE, GITHUB_TOKEN_KEY) {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(AppError::Internal(format!("keyring delete: {e}"))),
        }
    }
    status().await
}

#[tauri::command]
pub async fn list_repo_accounts() -> AppResult<Vec<RepoAccount>> {
    let Some((client, _)) = resolve_client()? else {
        return Err(not_connected());
    };
    let user: GhUser = gh_get(&client, "/user").await?;
    let mut accounts = vec![RepoAccount {
        id: format!("gh_user_{}", user.login),
        login: user.login,
        connected: true,
    }];
    // Orgs are best-effort — a token without read:org just sees its own repos.
    if let Ok(orgs) = gh_get_all::<GhOrg>(&client, "/user/orgs", &[]).await {
        for org in orgs {
            accounts.push(RepoAccount {
                id: format!("gh_org_{}", org.login),
                login: org.login,
                connected: true,
            });
        }
    }
    Ok(accounts)
}

/// `owner = None` lists everything the credential can see (own + collaborator
/// + org-member repos); an explicit owner scopes to that org or user.
#[tauri::command]
pub async fn list_github_repos(owner: Option<String>) -> AppResult<Vec<GitRepo>> {
    let Some((client, _)) = resolve_client()? else {
        return Err(not_connected());
    };
    let owner = owner.as_deref().map(str::trim).filter(|o| !o.is_empty());
    let user: GhUser = gh_get(&client, "/user").await?;

    let repos: Vec<GhRepo> = match owner {
        // Own + collaborated + org-member repos for the authenticated user.
        None => user_repos(&client).await?,
        Some(org) if org == user.login => user_repos(&client).await?,
        Some(org) => owner_repos(&client, org).await?,
    };
    Ok(repos.into_iter().map(map_repo).collect())
}

async fn user_repos(client: &reqwest::Client) -> AppResult<Vec<GhRepo>> {
    gh_get_all(
        client,
        "/user/repos",
        &[
            ("sort", "updated"),
            ("affiliation", "owner,collaborator,organization_member"),
        ],
    )
    .await
}

/// Repos of an org, falling back to the user-repos listing for personal
/// accounts (which have no /orgs endpoint).
async fn owner_repos(client: &reqwest::Client, owner: &str) -> AppResult<Vec<GhRepo>> {
    let org_path = format!("/orgs/{owner}/repos");
    match gh_get_all::<GhRepo>(client, &org_path, &[("sort", "updated"), ("type", "all")]).await {
        Ok(repos) => Ok(repos),
        Err(AppError::NotFound(_)) => {
            gh_get_all(
                client,
                &format!("/users/{owner}/repos"),
                &[("sort", "updated"), ("type", "owner")],
            )
            .await
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn list_github_branches(owner: String, repo: String) -> AppResult<Vec<String>> {
    let Some((client, _)) = resolve_client()? else {
        return Err(not_connected());
    };
    let owner = owner.trim();
    let repo = repo.trim();
    if owner.is_empty() || repo.is_empty() {
        return Err(AppError::Validation("缺少 owner 或仓库名".into()));
    }
    let branches: Vec<GhBranch> =
        gh_get_all(&client, &format!("/repos/{owner}/{repo}/branches"), &[]).await?;
    Ok(branches.into_iter().map(|b| b.name).collect())
}
