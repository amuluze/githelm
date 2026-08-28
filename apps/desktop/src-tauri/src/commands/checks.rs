//! Background checks that keep the issues page honest for the ops half of
//! its promise: for every project with an access URL it verifies the domain
//! still resolves (kind `domain`), the service port still accepts TCP
//! (kind `port`) and the TLS certificate is present and not near expiry
//! (kind `certificate`); for projects with a local checkout it compares the
//! live deployment against local HEAD (kind `version`).
//!
//! Failures open one issue per kind and project (deduped on `target_id`,
//! resolved when the check passes again — same anchor the deploy pipeline
//! uses). The TLS probe intentionally drives a skip-verify handshake: the
//! app never sends data, it only reads the peer certificate chain to read
//! `notAfter`, so trust is not a concern here.

use std::net::ToSocketAddrs;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use uuid::Uuid;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage;
use crate::types::{DeploymentStatus, Issue, IssueKind, IssueStatus, Project};

/// How often the background loop re-runs every check.
pub const SCAN_INTERVAL_SECS: u64 = 300;

/// A certificate expiring within this many days (or already expired) opens
/// a `certificate` issue.
const CERT_WARN_DAYS: i64 = 14;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

/// Result of one full scan over every project.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub checked: u32,
    pub opened: u32,
    pub resolved: u32,
}

/// Runs a scan from a Tauri command: loads projects, checks all of them in
/// parallel and notifies the renderer when anything transitioned.
#[tauri::command]
pub async fn scan_issues(app: AppHandle) -> AppResult<ScanSummary> {
    let state = app.state::<AppState>();
    let (db, projects) = {
        let conn = state.db.lock().expect("db mutex");
        (state.db.clone(), storage::list_projects(&conn)?)
    };
    let summary = scan_projects(&db, &projects).await;
    if summary.opened > 0 || summary.resolved > 0 {
        let _ = app.emit("issues-changed", ());
    }
    Ok(summary)
}

/// Background loop entry — same scan, errors only logged.
pub async fn scan_quiet(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (db, projects) = {
        let conn = state.db.lock().expect("db mutex");
        (state.db.clone(), match storage::list_projects(&conn) {
            Ok(projects) => projects,
            Err(err) => {
                eprintln!("[githelm] background scan load: {err}");
                return;
            }
        })
    };
    let summary = scan_projects(&db, &projects).await;
    if summary.opened > 0 || summary.resolved > 0 {
        let _ = app.emit("issues-changed", ());
    }
}

/// Checks every project in parallel; per-project failures are isolated.
async fn scan_projects(db: &Arc<Mutex<Connection>>, projects: &[Project]) -> ScanSummary {
    let mut handles = Vec::with_capacity(projects.len());
    for project in projects {
        let db = db.clone();
        let project = project.clone();
        handles.push(tokio::spawn(async move { check_project(&db, &project).await }));
    }
    let mut summary = ScanSummary {
        checked: projects.len() as u32,
        opened: 0,
        resolved: 0,
    };
    for handle in handles {
        if let Ok(counts) = handle.await {
            summary.opened += counts.opened;
            summary.resolved += counts.resolved;
        }
    }
    summary
}

#[derive(Debug, Default, Clone, Copy)]
struct Counts {
    opened: u32,
    resolved: u32,
}

impl Counts {
    fn mark_opened(&mut self) {
        self.opened += 1;
    }
    fn mark_resolved(&mut self) {
        self.resolved += 1;
    }
}

async fn check_project(db: &Arc<Mutex<Connection>>, project: &Project) -> Counts {
    let mut counts = Counts::default();
    let url = project.url.as_deref().map(str::trim).filter(|u| !u.is_empty());
    if let Some(url) = url {
        check_url(db, project, url, &mut counts).await;
    }
    check_version(db, project, &mut counts).await;
    counts
}

// ── URL checks: domain → port → certificate ─────────────────────────────

async fn check_url(db: &Arc<Mutex<Connection>>, project: &Project, url: &str, counts: &mut Counts) {
    let target = url::Url::parse(url).ok().and_then(|u| {
        let host = u.host_str()?.to_string();
        let port = u.port_or_known_default().unwrap_or(80);
        Some((host, port, u.scheme() == "https"))
    });
    let Some((host, port, is_tls)) = target else {
        if ensure_issue(
            db,
            project,
            IssueKind::Domain,
            "访问地址无法解析",
            &format!("「{url}」不是有效的 http(s) 地址，无法进行可用性检查。"),
        ) {
            counts.mark_opened();
        }
        return;
    };

    // 1) Domain: the host must resolve.
    match resolve_host(&host).await {
        Err(reason) => {
            if ensure_issue(
                db,
                project,
                IssueKind::Domain,
                "域名无法解析",
                &format!("{host} 解析失败：{reason}。"),
            ) {
                counts.mark_opened();
            }
            return;
        }
        Ok(()) => {
            if resolve_kind_issue(db, project, &IssueKind::Domain) {
                counts.mark_resolved();
            }
        }
    }

    // 2) Port: the service port must accept a TCP connection.
    match tcp_connect(&host, port).await {
        Err(reason) => {
            if ensure_issue(
                db,
                project,
                IssueKind::Port,
                &format!("端口 {port} 不可达"),
                &format!("{host}:{port} 连接失败：{reason}。"),
            ) {
                counts.mark_opened();
            }
            return;
        }
        Ok(()) => {
            if resolve_kind_issue(db, project, &IssueKind::Port) {
                counts.mark_resolved();
            }
        }
    }

    // 3) Certificate: https only — read the leaf certificate's notAfter.
    if !is_tls {
        return;
    }
    match cert_days_left(&host, port).await {
        Err(reason) => {
            if ensure_issue(
                db,
                project,
                IssueKind::Certificate,
                "TLS 证书异常",
                &format!("{host} 证书检查失败：{reason}。"),
            ) {
                counts.mark_opened();
            }
        }
        Ok(days) if days < 0 => {
            if ensure_issue(
                db,
                project,
                IssueKind::Certificate,
                "TLS 证书已过期",
                &format!("{host} 的证书已于 {} 天前过期。", -days),
            ) {
                counts.mark_opened();
            }
        }
        Ok(days) if days <= CERT_WARN_DAYS => {
            if ensure_issue(
                db,
                project,
                IssueKind::Certificate,
                "TLS 证书即将过期",
                &format!("{host} 的证书将在 {days} 天后过期，请及时续期。"),
            ) {
                counts.mark_opened();
            }
        }
        Ok(_) => {
            if resolve_kind_issue(db, project, &IssueKind::Certificate) {
                counts.mark_resolved();
            }
        }
    }
}

async fn resolve_host(host: &str) -> Result<(), String> {
    let target = (host.to_string(), 443u16);
    let resolved = tokio::task::spawn_blocking(move || {
        ToSocketAddrs::to_socket_addrs(&target).map(|it| it.count())
    })
    .await
    .map_err(|e| e.to_string())?;
    match resolved {
        Ok(n) if n > 0 => Ok(()),
        Ok(_) => Err("没有可用的解析结果".into()),
        Err(e) => Err(e.to_string()),
    }
}

async fn tcp_connect(host: &str, port: u16) -> Result<(), String> {
    match tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect((host, port))).await {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err(format!("连接超时（{} 秒）", CONNECT_TIMEOUT.as_secs())),
    }
}

/// Performs a skip-verify TLS handshake and returns the leaf certificate's
/// remaining validity in days (negative when already expired).
async fn cert_days_left(host: &str, port: u16) -> Result<i64, String> {
    let server_name = rustls::pki_types::ServerName::try_from(host.to_string())
        .map_err(|_| format!("无效的主机名 {host}"))?;
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(AcceptAny))
        .with_no_client_auth();
    let connector = TlsConnector::from(Arc::new(config));

    let tcp = tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect((host, port)))
        .await
        .map_err(|_| format!("连接超时（{} 秒）", CONNECT_TIMEOUT.as_secs()))?
        .map_err(|e| e.to_string())?;
    let tls = tokio::time::timeout(CONNECT_TIMEOUT, connector.connect(server_name, tcp))
        .await
        .map_err(|_| format!("TLS 握手超时（{} 秒）", CONNECT_TIMEOUT.as_secs()))?
        .map_err(|e| format!("TLS 握手失败：{e}"))?;
    let (_, session) = tls.get_ref();
    let leaf = session
        .peer_certificates()
        .and_then(|chain| chain.first())
        .ok_or("服务器未提供证书")?;
    let (_, cert) = x509_parser::parse_x509_certificate(leaf.as_ref())
        .map_err(|e| format!("证书解析失败：{e}"))?;
    let not_after = cert.validity().not_after.timestamp();
    Ok((not_after - chrono::Utc::now().timestamp()) / 86_400)
}

/// Accepts every server certificate. Only safe because the probe never
/// transmits data — it exists purely to observe the certificate chain.
#[derive(Debug)]
struct AcceptAny;

impl rustls::client::danger::ServerCertVerifier for AcceptAny {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        // A fixed, broad list: the probe asserts all signatures anyway.
        vec![
            rustls::SignatureScheme::RSA_PKCS1_SHA256,
            rustls::SignatureScheme::RSA_PKCS1_SHA384,
            rustls::SignatureScheme::RSA_PKCS1_SHA512,
            rustls::SignatureScheme::RSA_PSS_SHA256,
            rustls::SignatureScheme::RSA_PSS_SHA384,
            rustls::SignatureScheme::RSA_PSS_SHA512,
            rustls::SignatureScheme::ECDSA_NISTP256_SHA256,
            rustls::SignatureScheme::ECDSA_NISTP384_SHA384,
            rustls::SignatureScheme::ED25519,
        ]
    }
}

// ── Version check: live deployment vs local HEAD ─────────────────────────

/// Flags when the live deployment no longer matches the local checkout:
/// behind by N commits, or diverged. A failing git query (no checkout, no
/// git) is not an issue — it just means the check cannot run.
async fn check_version(db: &Arc<Mutex<Connection>>, project: &Project, counts: &mut Counts) {
    let Some(local_path) = project.local_path.as_deref().map(str::trim).filter(|p| !p.is_empty())
    else {
        return;
    };
    let live_sha = {
        let conn = db.lock().expect("db mutex");
        storage::list_deployments(&conn, Some(&project.id))
            .ok()
            .and_then(|deps| {
                deps.into_iter()
                    .find(|d| d.status == DeploymentStatus::Live)
                    .map(|d| d.commit_sha)
            })
            .filter(|sha| sha != "unknown")
    };
    let Some(live_sha) = live_sha else {
        return;
    };

    let head = match git_out(local_path, &["rev-parse", "HEAD"]).await {
        Some(head) => head,
        None => return,
    };
    if head.starts_with(&live_sha) {
        if resolve_kind_issue(db, project, &IssueKind::Version) {
            counts.mark_resolved();
        }
        return;
    }

    if git_out(local_path, &["merge-base", "--is-ancestor", &live_sha, "HEAD"])
        .await
        .is_some()
    {
        let behind = git_out(local_path, &["rev-list", "--count", &format!("{live_sha}..HEAD")])
            .await
            .unwrap_or_else(|| "?".into());
        if ensure_issue(
            db,
            project,
            IssueKind::Version,
            "线上版本落后于本地",
            &format!("本地 HEAD 领先已上线的 {live_sha} 约 {behind} 个提交，重新部署即可发布。"),
        ) {
            counts.mark_opened();
        }
    }
    else if ensure_issue(
        db,
        project,
        IssueKind::Version,
        "线上版本与本地历史分叉",
        &format!("已上线的 {live_sha} 不在本地 HEAD（{:.7}）的历史中，请确认要部署的版本。", head),
    ) {
        counts.mark_opened();
    }
}

async fn git_out(dir: &str, args: &[&str]) -> Option<String> {
    use tokio::process::Command;
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .await
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

// ── Issue bookkeeping (one open issue per kind and project) ─────────────

/// Opens the issue unless one of the same kind is already open for the
/// project. Returns true when a new row was created.
fn ensure_issue(
    db: &Arc<Mutex<Connection>>,
    project: &Project,
    kind: IssueKind,
    title: &str,
    description: &str,
) -> bool {
    let conn = db.lock().expect("db mutex");
    match storage::find_open_issue(&conn, &kind, Some(&project.id), &project.name) {
        Ok(Some(_)) => return false,
        Ok(None) => {}
        Err(err) => {
            eprintln!("[githelm] find open issue: {err}");
            return false;
        }
    }
    let issue = Issue {
        id: format!(
            "iss_{}",
            Uuid::new_v4()
                .simple()
                .to_string()
                .chars()
                .take(12)
                .collect::<String>()
        ),
        kind,
        status: IssueStatus::Open,
        title: title.to_string(),
        description: description.to_string(),
        target_name: project.name.clone(),
        target_id: Some(project.id.clone()),
        deployment_id: None,
        detected_at: chrono::Utc::now().to_rfc3339(),
        resolved_at: None,
    };
    match storage::insert_issue(&conn, &issue) {
        Ok(()) => true,
        Err(err) => {
            eprintln!("[githelm] insert issue: {err}");
            false
        }
    }
}

/// Resolves the open issue of `kind` for the project; true when one existed.
fn resolve_kind_issue(db: &Arc<Mutex<Connection>>, project: &Project, kind: &IssueKind) -> bool {
    let conn = db.lock().expect("db mutex");
    match storage::find_open_issue(&conn, kind, Some(&project.id), &project.name) {
        Ok(Some(issue)) => {
            let now = chrono::Utc::now().to_rfc3339();
            match storage::resolve_issue(&conn, &issue.id, &now) {
                Ok(()) => true,
                Err(err) => {
                    eprintln!("[githelm] resolve issue: {err}");
                    false
                }
            }
        }
        Ok(None) => false,
        Err(err) => {
            eprintln!("[githelm] find open issue: {err}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage as s;
    use crate::types::{Provider, ProjectStatus};

    fn temp_db() -> (Arc<Mutex<Connection>>, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("githelm-checks-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let conn = s::open_at(&dir.join("githelm.db")).unwrap();
        (Arc::new(Mutex::new(conn)), dir)
    }

    fn project(id: &str, url: Option<&str>, local_path: Option<&str>) -> Project {
        Project {
            id: id.into(),
            name: "Demo".into(),
            slug: "demo".into(),
            repository: "acme/demo".into(),
            branch: "main".into(),
            status: ProjectStatus::Idle,
            latest_deployment_id: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            url: url.map(str::to_string),
            deployment_count: 0,
            provider: Provider::Github,
            local_path: local_path.map(str::to_string),
            server_id: None,
            deploy_dir: None,
            build_command: None,
            update_command: None,
        }
    }

    #[test]
    fn ensure_dedupes_and_resolves_per_kind() {
        let (db, dir) = temp_db();
        let p = project("prj_1", None, None);
        assert!(ensure_issue(&db, &p, IssueKind::Port, "端口 443 不可达", "x"));
        // A second failing scan must not duplicate the issue…
        assert!(!ensure_issue(&db, &p, IssueKind::Port, "端口 443 不可达", "x"));
        // …and a different kind is tracked independently.
        assert!(ensure_issue(&db, &p, IssueKind::Domain, "域名无法解析", "y"));
        assert_eq!(s::list_issues(&db.lock().unwrap()).unwrap().len(), 2);

        assert!(resolve_kind_issue(&db, &p, &IssueKind::Port));
        assert!(!resolve_kind_issue(&db, &p, &IssueKind::Port));
        let issues = s::list_issues(&db.lock().unwrap()).unwrap();
        assert_eq!(issues.len(), 2);
        assert!(issues.iter().any(|i| i.status == IssueStatus::Open));
        assert!(issues.iter().any(|i| i.status == IssueStatus::Resolved));
        let _ = std::fs::remove_dir_all(dir);
    }

    /// A version check against a non-repo local path must be a silent
    /// skip: no git history means nothing to compare.
    #[tokio::test]
    async fn version_check_skips_without_git_repo() {
        let (db, dir) = temp_db();
        let p = project("prj_v", None, Some(dir.display().to_string().as_str()));
        let mut counts = Counts::default();
        check_version(&db, &p, &mut counts).await;
        assert_eq!(counts.opened, 0);
        assert!(s::list_issues(&db.lock().unwrap()).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Real sockets: an IP literal with a refused port must open exactly one
    /// port issue (dedupe holds across rescans), and domain must stay quiet.
    #[tokio::test]
    #[ignore = "spawns real TCP connections to a refused port"]
    async fn unreachable_port_opens_one_issue() {
        let (db, dir) = temp_db();
        let p = project("prj_u", Some("https://127.0.0.1:1"), None);

        let first = check_project(&db, &p).await;
        assert_eq!(first.opened, 1, "port failure should open one issue");
        let issues = s::list_issues(&db.lock().unwrap()).unwrap();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].kind, IssueKind::Port);
        assert_eq!(issues[0].target_id.as_deref(), Some("prj_u"));

        let second = check_project(&db, &p).await;
        assert_eq!(second.opened, 0, "rescan must not duplicate");
        assert_eq!(s::list_issues(&db.lock().unwrap()).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
