use tauri::State;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::storage;
use crate::types::{CreateProjectInput, Project, ProjectStatus, UpdateProjectConfigInput};

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    let conn = state.db.lock().expect("db mutex");
    storage::list_projects(&conn)
}

/// Saves the deploy pipeline config from the deploy dialog and returns the
/// refreshed project.
#[tauri::command]
pub fn update_project_config(
    state: State<'_, AppState>,
    input: UpdateProjectConfigInput,
) -> AppResult<Project> {
    {
        let conn = state.db.lock().expect("db mutex");
        if let Some(server_id) = input.server_id.as_deref() {
            let server_id = server_id.trim();
            if !server_id.is_empty() && storage::get_server(&conn, server_id)?.is_none() {
                return Err(AppError::Validation(format!("服务器 {server_id} 不存在")));
            }
        }
        storage::update_project_config(
            &conn,
            &input.project_id,
            input.local_path.as_deref(),
            input.server_id.as_deref(),
            input.deploy_dir.as_deref(),
            input.build_command.as_deref(),
            input.update_command.as_deref(),
        )?;
    }
    let conn = state.db.lock().expect("db mutex");
    storage::get_project(&conn, &input.project_id)?
        .ok_or_else(|| AppError::NotFound(format!("project {}", input.project_id)))
}

#[tauri::command]
pub fn get_project(state: State<'_, AppState>, id: String) -> AppResult<Project> {
    let conn = state.db.lock().expect("db mutex");
    storage::get_project(&conn, &id)?.ok_or_else(|| AppError::NotFound(format!("project {id}")))
}

/// "Create project" / "Import from GitHub" — the only writer of the projects
/// table. Repositories are deduplicated so importing the same repo twice
/// fails loudly instead of producing twin projects.
#[tauri::command]
pub fn create_project(state: State<'_, AppState>, input: CreateProjectInput) -> AppResult<Project> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation("项目名称不能为空".into()));
    }
    let repository = normalize_repository(&input.repository);
    if repository.is_empty() {
        return Err(AppError::Validation("仓库地址不能为空".into()));
    }
    let branch = input.branch.trim().to_string();
    if branch.is_empty() {
        return Err(AppError::Validation("分支不能为空".into()));
    }

    let slug = slugify(&name);
    let conn = state.db.lock().expect("db mutex");
    if storage::find_project_by_repository(&conn, &repository)?.is_some() {
        return Err(AppError::Validation(format!(
            "仓库 {repository} 已导入，请在项目列表中查看"
        )));
    }

    let project = Project {
        id: format!(
            "prj_{}",
            Uuid::new_v4()
                .simple()
                .to_string()
                .chars()
                .take(8)
                .collect::<String>()
        ),
        name,
        slug,
        repository,
        branch,
        status: ProjectStatus::Idle,
        latest_deployment_id: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        url: input.url.filter(|u| !u.trim().is_empty()),
        deployment_count: 0,
        provider: input.provider,
        local_path: None,
        server_id: None,
        deploy_dir: None,
        build_command: None,
        update_command: None,
    };
    storage::insert_project(&conn, &project)?;
    Ok(project)
}

/// Collapses https/ssh GitHub-style URLs to `owner/name`; plain `owner/name`
/// and bare repo names pass through untouched.
fn normalize_repository(raw: &str) -> String {
    let mut s = raw.trim().trim_end_matches('/').to_string();
    if let Some(stripped) = s.strip_suffix(".git") {
        s = stripped.trim_end_matches('/').to_string();
    }
    if let Some(rest) = s
        .strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"))
    {
        s = rest.to_string();
    } else if s.starts_with("git@") {
        if let Some((_, rest)) = s.split_once(':') {
            s = rest.to_string();
        }
    }
    if let Some((_, path)) = s.split_once('/') {
        let segments: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
        if segments.len() >= 2 {
            return format!("{}/{}", segments[0], segments[1]);
        }
    }
    s
}

/// Project name → URL-safe slug ("My Atlas! v2" → "my-atlas-v2").
fn slugify(name: &str) -> String {
    let mut slug = String::new();
    let mut last_was_hyphen = false;
    for ch in name.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            last_was_hyphen = false;
        } else if !last_was_hyphen && !slug.is_empty() {
            slug.push('-');
            last_was_hyphen = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "project".into()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_url_forms() {
        assert_eq!(
            normalize_repository("https://github.com/acme/atlas"),
            "acme/atlas"
        );
        assert_eq!(
            normalize_repository("https://github.com/acme/atlas.git"),
            "acme/atlas"
        );
        assert_eq!(
            normalize_repository("git@github.com:acme/atlas.git"),
            "acme/atlas"
        );
        assert_eq!(
            normalize_repository("https://gitlab.com/acme/atlas.git/"),
            "acme/atlas"
        );
        // deep links collapse to owner/repo
        assert_eq!(
            normalize_repository("https://github.com/acme/atlas/tree/main"),
            "acme/atlas"
        );
        // already plain forms pass through
        assert_eq!(normalize_repository("acme/atlas"), "acme/atlas");
        assert_eq!(normalize_repository("atlas"), "atlas");
    }

    #[test]
    fn slugify_keeps_alnum_and_hyphens() {
        assert_eq!(slugify("My Atlas! v2"), "my-atlas-v2");
        assert_eq!(slugify("  --prod--  "), "prod");
        assert_eq!(slugify("前端项目"), "project");
        assert_eq!(slugify(""), "project");
    }
}
