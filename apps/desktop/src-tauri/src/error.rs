use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("validation failed: {0}")]
    Validation(String),
    /// A running deploy pipeline was stopped by the user; never surfaced to
    /// the renderer as an error — the pipeline turns it into a log line and
    /// a `cancelled` deployment status.
    #[error("cancelled")]
    Cancelled,
    #[error("internal error: {0}")]
    Internal(String),
}

/// Tauri commands need errors that serialize as a string. We collapse every
/// variant into a single `message` so the renderer never has to discriminate
/// across variants — it only needs to know what to show the user.
#[derive(Debug, Serialize)]
struct AppErrorPayload {
    message: String,
    code: &'static str,
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let payload = AppErrorPayload {
            message: self.to_string(),
            code: match self {
                AppError::NotFound(_) => "NOT_FOUND",
                AppError::Validation(_) => "VALIDATION",
                AppError::Cancelled => "CANCELLED",
                AppError::Internal(_) => "INTERNAL",
            },
        };
        payload.serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
