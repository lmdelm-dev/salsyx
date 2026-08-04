// Thin, typed client for the Salsyx REST API.
//
// The Next.js dev/prod proxy (next.config.mjs) forwards `/api/*` to the Rust
// backend, so the frontend always calls relative URLs and stays deployable
// on Cloudflare Pages / Vercel behind a reverse proxy.

// API base URL.
//
// On the Node/standalone deploy (Docker, Fly) the Next.js proxy rewrites
// `/api/*` to the backend, so relative paths would work. But on the static
// Cloudflare Pages export there is no proxy, so we call the backend at its
// absolute origin. Build with `NEXT_PUBLIC_API_ORIGIN` to override.
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8080";

function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`;
}

// Resolve a possibly-relative backend URL (e.g. `/api/v1/download/{id}`)
// against the API origin so links work from the static frontend deploy.
export function resolveApiUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return apiUrl(url);
}

// Absolute URL of the OpenAPI document (served by the backend at
// `/openapi.json`, NOT under `/api/` — so a relative `/api/openapi.json`
// link would hit the static frontend and fail with a Cloudflare 1003).
export function openApiUrl(): string {
  return apiUrl("/openapi.json");
}

import type {
  AdminJobCount,
  AdminOverview,
  Archive,
  ErrorBody,
  HealthResponse,
  HistoryResponse,
  OwnerResponse,
  ReadmeResponse,
  RepoResponse,
  SearchResponse,
  StatsResponse,
  TreeResponse,
} from "./types";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, body: ErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
    // Stream-friendly: keep connections warm, the backend sets Cache-Control.
    cache: init?.cache ?? "no-store",
  });

  if (!res.ok) {
    let body: ErrorBody = { code: "internal_error", message: res.statusText };
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body);
  }

  return (await res.json()) as T;
}

export interface SearchParams {
  q?: string;
  mode?: "exact" | "partial" | "fuzzy" | "full_text";
  owner?: string;
  language?: string;
  license?: string;
  topics?: string;
  min_stars?: number;
  include_deleted?: boolean;
  archived_only?: boolean;
  sort?: "relevance" | "stars" | "forks" | "name" | "updated_at" | "archived_at" | "commit_count";
  order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export const api = {
  health(): Promise<HealthResponse> {
    return request<HealthResponse>(apiUrl("/api/v1/health"));
  },

  search(params: SearchParams = {}): Promise<SearchResponse> {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.mode) query.set("mode", params.mode);
    if (params.owner) query.set("owner", params.owner);
    if (params.language) query.set("language", params.language);
    if (params.license) query.set("license", params.license);
    if (params.topics) query.set("topics", params.topics);
    if (params.min_stars != null) query.set("min_stars", String(params.min_stars));
    if (params.include_deleted) query.set("include_deleted", "true");
    if (params.archived_only) query.set("archived_only", "true");
    if (params.sort) query.set("sort", params.sort);
    if (params.order) query.set("order", params.order);
    query.set("page", String(params.page ?? 1));
    query.set("per_page", String(params.per_page ?? 20));

    return request<SearchResponse>(apiUrl(`/api/v1/search?${query.toString()}`));
  },

  repo(owner: string, repo: string): Promise<RepoResponse> {
    return request<RepoResponse>(apiUrl(`/api/v1/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`));
  },

  readme(owner: string, repo: string): Promise<ReadmeResponse> {
    return request<ReadmeResponse>(
      apiUrl(`/api/v1/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`),
    );
  },

  owner(login: string): Promise<OwnerResponse> {
    return request<OwnerResponse>(apiUrl(`/api/v1/owner/${encodeURIComponent(login)}`));
  },

  history(owner: string, repo: string): Promise<HistoryResponse> {
    return request<HistoryResponse>(
      apiUrl(`/api/v1/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/archives`),
    );
  },

  archiveTree(id: string): Promise<TreeResponse> {
    return request<TreeResponse>(apiUrl(`/api/v1/archive/${id}/tree`));
  },

  blobUrl(id: string, path: string): string {
    return apiUrl(`/api/v1/archive/${id}/blob?path=${encodeURIComponent(path)}`);
  },

  archive(id: string): Promise<Archive> {
    return request<{ archive: Archive; download_url: string }>(apiUrl(`/api/v1/archive/${id}`)).then(
      (r) => r.archive,
    );
  },

  stats(): Promise<StatsResponse> {
    return request<StatsResponse>(apiUrl("/api/v1/stats"));
  },

  requestArchive(fullName: string): Promise<{ archive_id: string; status: string }> {
    return request<{ archive_id: string; status: string }>(apiUrl("/api/v1/archive"), {
      method: "POST",
      body: JSON.stringify({ full_name: fullName }),
    });
  },

  downloadUrl(id: string): string {
    return apiUrl(`/api/v1/download/${id}`);
  },

  adminOverview(token: string): Promise<AdminOverview> {
    return request<AdminOverview>(apiUrl("/api/v1/admin/overview"), {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};
