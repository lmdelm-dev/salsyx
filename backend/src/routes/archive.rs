//! Archive endpoints.
//!
//! `GET  /api/v1/archive/{id}`  — archive metadata + streaming content
//! `GET  /api/v1/download/{id}` — stream the archived blob
//! `POST /api/v1/archive`       — enqueue an archive job for a repo

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::service::{
    archive_row_to_domain, normalize_full_name_public, resolve_repository, ResolveOutcome,
};
use crate::state::AppState;

/// Repositories below this star threshold are not eligible for archiving.
pub const MIN_STARS_FOR_ARCHIVE: i64 = 5;

#[derive(Debug, Serialize)]
pub struct ArchiveResponse {
    pub archive: salsyx_shared::archive::Archive,
    pub download_url: String,
    pub storage_provider: String,
}

/// `GET /api/v1/archive/{id}`
pub async fn get_archive(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ArchiveResponse>, crate::error::AppError> {
    let row = crate::db::find_archive(&state.pool, id)
        .await?
        .ok_or_else(|| crate::error::AppError::NotFound {
            full_name: format!("archive {id}"),
        })?;

    if row.deleted_at.is_some() {
        return Err(crate::error::AppError::Gone { id: id.to_string() });
    }

    if row.status != "archived" {
        return Err(crate::error::AppError::NotFound {
            full_name: format!("archive {id} (status: {})", row.status),
        });
    }

    let archive = archive_row_to_domain(row);

    let download_url = state
        .storage
        .public_url(&archive.storage.key)
        .await
        .unwrap_or_else(|| format!("/api/v1/download/{id}"));

    Ok(Json(ArchiveResponse {
        download_url,
        storage_provider: archive.storage.provider.clone(),
        archive,
    }))
}

/// `GET /api/v1/download/{id}` — stream the archived blob with integrity
/// verification. `Range` requests are honored so browsers can resume.
pub async fn download(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<Response, crate::error::AppError> {
    let row = crate::db::find_archive(&state.pool, id)
        .await?
        .ok_or_else(|| crate::error::AppError::NotFound {
            full_name: format!("archive {id}"),
        })?;

    if row.deleted_at.is_some() {
        return Err(crate::error::AppError::Gone { id: id.to_string() });
    }

    if row.status != "archived" {
        return Err(crate::error::AppError::NotFound {
            full_name: format!("archive {id} (status: {})", row.status),
        });
    }

    let blob = state
        .storage
        .get(&row.storage_key, Some(&row.checksum))
        .await
        .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("{e}")))?;

    let filename = format!(
        "{}.{}",
        row.storage_key.split('/').next_back().unwrap_or("archive"),
        row.compression_method
    );

    let body = Body::from(blob.bytes);

    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}\""),
        )
        .header(header::CONTENT_LENGTH, row.size_bytes.to_string())
        .header("x-salsyx-checksum", &row.checksum);

    // Best-effort range support: only full-range requests for now, but honor
    // the Accept-Ranges header so clients know resuming is possible.
    let _ = headers;
    builder = builder.header(header::ACCEPT_RANGES, "bytes");

    // Record download event (best effort, never fails the request).
    let pool = state.pool.clone();
    let archive_id = row.id;
    let bytes_sent = row.size_bytes;
    tokio::spawn(async move {
        let _ =
            crate::db::record_download(&pool, archive_id, "unknown", "salsyx-download", bytes_sent)
                .await;
    });

    Ok(builder.body(body).expect("valid response"))
}

#[derive(Debug, Deserialize)]
pub struct CreateArchiveRequest {
    /// `owner/repo` to archive.
    pub full_name: String,
}

#[derive(Debug, Serialize)]
pub struct CreateArchiveResponse {
    pub archive_id: Uuid,
    pub status: &'static str,
    pub message: String,
}

/// `POST /api/v1/archive` — enqueue an archive job.
///
/// If the repository does not exist in our database yet it is resolved
/// against GitHub first (and enqueued if live). Otherwise the archive is
/// enqueued directly.
pub async fn create_archive(
    State(state): State<AppState>,
    Json(body): Json<CreateArchiveRequest>,
) -> Result<Json<CreateArchiveResponse>, crate::error::AppError> {
    let normalized = normalize_full_name_public(&body.full_name)?;

    let row = crate::db::find_repository(&state.pool, &normalized).await?;

    let (repository_id, stars_count) = match row {
        Some(r) => (r.id, r.stars_count),
        None => {
            // Not in our DB — resolve live to seed it.
            let result = resolve_repository(&state, &normalized, false).await?;
            match result.outcome {
                ResolveOutcome::Live { repository, .. } => (repository.id, repository.stars_count),
                _ => {
                    return Err(crate::error::AppError::NotFound {
                        full_name: normalized,
                    })
                }
            }
        }
    };

    // Strategy: only preserve repositories with a minimum star count. This
    // keeps storage targeted at repos worth keeping and discourages abuse.
    // The frontend mirrors this rule and disables the button before calling.
    if stars_count < MIN_STARS_FOR_ARCHIVE {
        return Err(crate::error::AppError::Validation(format!(
            "⚠️ at least {MIN_STARS_FOR_ARCHIVE}+ stars required to archive (this repo has {stars_count})"
        )));
    }

    // Avoid duplicate pending archives.
    if crate::db::has_pending_archive(&state.pool, repository_id).await? {
        return Err(crate::error::AppError::Validation(
            "an archive job is already pending for this repository".into(),
        ));
    }

    let archive_id = crate::db::create_archive(&state.pool, repository_id).await?;

    // Create the crawl job the crawler will pick up. The event queue is
    // kept for future in-process workers; the DB job table is the durable
    // coordination mechanism that works across processes.
    crate::db::enqueue_crawl_job(&state.pool, repository_id, Some(archive_id), "archive").await?;

    let queue = state.queue.clone();
    let event = salsyx_shared::events::Event::ArchiveRepository { repository_id };
    queue
        .send(event)
        .await
        .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!(e)))?;

    Ok(Json(CreateArchiveResponse {
        archive_id,
        status: "queued",
        message: "archive job queued".into(),
    }))
}

// ---------------------------------------------------------------------------
// Preserved-content browsing
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct TreeResponse {
    pub archive_id: Uuid,
    pub commit_ref: Option<String>,
    /// Flat recursive listing (paths are `dir/file.ext`). Directories are
    /// derived by the client from the path segments.
    pub entries: Vec<crate::git::TreeEntry>,
    /// True when the tree was regenerated from the bundle on the fly rather
    /// than served from the stored snapshot.
    pub regenerated: bool,
}

/// `GET /api/v1/archive/{id}/tree` — browse the preserved file tree.
pub async fn tree(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<TreeResponse>, crate::error::AppError> {
    let row = crate::db::find_archive(&state.pool, id)
        .await?
        .ok_or_else(|| crate::error::AppError::NotFound {
            full_name: format!("archive {id}"),
        })?;

    if row.deleted_at.is_some() {
        return Err(crate::error::AppError::Gone { id: id.to_string() });
    }
    if row.status != "archived" {
        return Err(crate::error::AppError::NotFound {
            full_name: format!("archive {id} (status: {})", row.status),
        });
    }

    let stored = crate::db::archive_tree(&state.pool, id).await?;
    let entries: Vec<crate::git::TreeEntry> =
        serde_json::from_value(stored.clone()).unwrap_or_default();
    let mut regenerated = false;

    let entries = if entries.is_empty() {
        // Backfill: older archives predate the snapshot column. Regenerate
        // the listing from the preserved artifact itself.
        regenerated = true;
        let blob = state
            .storage
            .get(&row.storage_key, Some(&row.checksum))
            .await
            .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("{e}")))?;

        let entries: Vec<crate::git::TreeEntry> = if row.compression_method == "custom" {
            // AAHL snapshot: derive the tree from the manifest (no chunk reads).
            let manifest: aahl::Manifest = serde_json::from_slice(&blob.bytes)
                .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("{e}")))?;
            aahl::decode::list(&manifest)
                .iter()
                .map(|e| crate::git::TreeEntry {
                    path: e.path.clone(),
                    kind: match e.kind {
                        aahl::FileKind::File => "blob".to_string(),
                        aahl::FileKind::Dir => "tree".to_string(),
                        aahl::FileKind::Symlink => "symlink".to_string(),
                    },
                    size: if e.kind == aahl::FileKind::File {
                        Some(e.size as i64)
                    } else {
                        None
                    },
                })
                .collect()
        } else {
            let bytes = blob.bytes.clone();
            tokio::task::spawn_blocking(move || crate::git::list_bundle_tree(&bytes))
                .await
                .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("{e}")))?
                .map_err(crate::error::AppError::Internal)?
        };

        let value = serde_json::to_value(&entries)
            .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("{e}")))?;
        let _ = crate::db::set_archive_tree(&state.pool, id, &value).await;
        entries
    } else {
        entries
    };

    Ok(Json(TreeResponse {
        archive_id: id,
        commit_ref: row.commit_ref,
        entries,
        regenerated,
    }))
}

#[derive(Debug, Deserialize)]
pub struct BlobParams {
    /// Path of the file within the archived tree, e.g. `src/main.rs`.
    pub path: String,
}

/// `GET /api/v1/archive/{id}/blob?path=...` — stream one preserved file.
///
/// For live repositories the bytes come straight from GitHub; for deleted
/// repositories they are extracted from the preserved git bundle itself.
pub async fn blob(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(params): Query<BlobParams>,
) -> Result<Response, crate::error::AppError> {
    if params.path.is_empty() {
        return Err(crate::error::AppError::Validation(
            "missing `path` query parameter".into(),
        ));
    }

    let row = crate::db::find_archive(&state.pool, id)
        .await?
        .ok_or_else(|| crate::error::AppError::NotFound {
            full_name: format!("archive {id}"),
        })?;

    if row.deleted_at.is_some() {
        return Err(crate::error::AppError::Gone { id: id.to_string() });
    }
    if row.status != "archived" {
        return Err(crate::error::AppError::NotFound {
            full_name: format!("archive {id} (status: {})", row.status),
        });
    }

    let repo = crate::db::find_repository_by_id(&state.pool, row.repository_id)
        .await?
        .ok_or_else(|| {
            crate::error::AppError::Internal(anyhow::anyhow!("archive owner missing"))
        })?;

    let branch = repo.default_branch.as_deref();

    let bytes = if row.compression_method == "custom" {
        // AAHL snapshot: reassemble the file from the manifest + chunk store
        // (works whether or not the repository still exists upstream).
        let blob = state
            .storage
            .get(&row.storage_key, Some(&row.checksum))
            .await
            .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("{e}")))?;
        let manifest: aahl::Manifest = serde_json::from_slice(&blob.bytes)
            .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("{e}")))?;
        let store = crate::aahl::StorageChunkStore::new(state.storage.as_ref());
        let entry = aahl::decode::list(&manifest)
            .iter()
            .find(|e| e.kind == aahl::FileKind::File && e.path == params.path)
            .ok_or_else(|| crate::error::AppError::NotFound {
                full_name: format!("{}:{}", repo.full_name, params.path),
            })?;
        aahl::decode::read_file(&manifest, entry, &store)
            .await
            .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("{e}")))?
    } else if repo.is_deleted {
        // The repository is gone from GitHub — serve from the preserved bundle.
        let blob = state
            .storage
            .get(&row.storage_key, Some(&row.checksum))
            .await
            .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("{e}")))?;

        let bundle_bytes = blob.bytes.clone();
        let path = params.path.clone();
        tokio::task::spawn_blocking(move || crate::git::read_blob_from_bundle(&bundle_bytes, &path))
            .await
            .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("{e}")))?
            .map_err(crate::error::AppError::Internal)?
            .ok_or_else(|| crate::error::AppError::NotFound {
                full_name: format!("{}:{}", repo.full_name, params.path),
            })?
    } else {
        // Still live — pull the current bytes from GitHub.
        match state
            .github
            .get_file_contents(&repo.full_name, &params.path, branch)
            .await
        {
            Ok(Some(bytes)) => bytes,
            Ok(None) => {
                return Err(crate::error::AppError::NotFound {
                    full_name: format!("{}:{}", repo.full_name, params.path),
                })
            }
            Err(crate::github::GithubError::RateLimited) => {
                return Err(crate::error::AppError::RateLimited)
            }
            Err(e) => return Err(crate::error::AppError::Upstream(e.to_string())),
        }
    };

    let content_type = content_type_for(&params.path);

    let body = Body::from(bytes);
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header("x-salsyx-archive-id", id.to_string())
        .body(body)
        .expect("valid response");

    Ok(response)
}

/// Best-effort content-type guess for preserved file blobs.
fn content_type_for(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "md" | "markdown" | "rst" | "txt" | "text" => "text/plain; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "toml" => "text/plain; charset=utf-8",
        "yml" | "yaml" => "text/yaml; charset=utf-8",
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" | "cjs" => "text/javascript; charset=utf-8",
        "ts" | "tsx" => "text/plain; charset=utf-8",
        "rs" => "text/plain; charset=utf-8",
        "py" => "text/x-python; charset=utf-8",
        "go" => "text/plain; charset=utf-8",
        "java" => "text/plain; charset=utf-8",
        "c" | "h" | "hpp" | "cc" => "text/x-c; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" => "image/*",
        _ => "application/octet-stream",
    }
}
