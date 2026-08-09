"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
  Search,
  Star,
  GitFork,
  Archive,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Globe,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatNumber, type SearchItem, type SearchResponse } from "@/lib/types";

const LANGUAGES = [
  "Rust",
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "C",
  "C++",
  "Ruby",
  "Zig",
];

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="pt-40 text-center text-sm text-ink-faint">Loading…</div>}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const language = searchParams.get("language") ?? "";
  const minStars = Number(searchParams.get("min_stars") ?? 0);
  const includeDeleted = searchParams.get("include_deleted") === "true";
  const archivedOnly = searchParams.get("archived_only") === "true";
  const sort = (searchParams.get("sort") as "stars" | "relevance") ?? "stars";
  const page = Number(searchParams.get("page") ?? 1);

  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState(q);

  useEffect(() => setQuery(q), [q]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .search({
        q,
        language: language || undefined,
        min_stars: minStars || undefined,
        include_deleted: includeDeleted,
        archived_only: archivedOnly,
        sort,
        page,
      })
      .then(setResult)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q, language, minStars, includeDeleted, archivedOnly, sort, page]);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === "0") next.delete(key);
      else next.set(key, value);
      if (key !== "page") next.set("page", "1");
      router.push(`/search?${next.toString()}`);
    },
    [router, searchParams],
  );

  const clearFilters = () => router.push("/search");

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24 pt-28">
      {/* Header + search input */}
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-black tracking-tight md:text-5xl">
          Search the <span className="text-gradient">archive</span>
        </h1>
        <p className="mt-2 text-sm text-ink-dim">
          Live GitHub results first, preserved snapshots when repos disappear.
        </p>
        <form
          className="relative mt-8"
          onSubmit={(e) => {
            e.preventDefault();
            updateParam("q", query.trim() || null);
          }}
        >
          <div className="relative overflow-hidden rounded-full border border-edge bg-panel/70 transition-all focus-within:border-neon/60 focus-within:shadow-glow-cyan">
            <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search repositories…"
              aria-label="Search repositories"
              className="w-full bg-transparent py-4 pl-14 pr-14 font-mono text-sm text-ink outline-none placeholder:text-ink-faint"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear"
                className="absolute right-16 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
              >
                <X className="size-4" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-xs font-semibold text-white"
            >
              Go
            </button>
          </div>
        </form>
      </div>

      {/* Filter bar */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition-all ${
            showFilters
              ? "border-neon/50 text-neon"
              : "border-edge text-ink-dim hover:border-neon/30 hover:text-ink"
          }`}
        >
          <Filter className="size-3.5" /> Filters
        </button>
        {language && (
          <FilterChip onRemove={() => updateParam("language", null)}>
            {language}
          </FilterChip>
        )}
        {minStars > 0 && (
          <FilterChip onRemove={() => updateParam("min_stars", null)}>
            ⭐ {minStars.toLocaleString()}+
          </FilterChip>
        )}
        {archivedOnly && <FilterChip onRemove={() => updateParam("archived_only", null)}>Archived only</FilterChip>}
        {includeDeleted && <FilterChip onRemove={() => updateParam("include_deleted", null)}>Deleted</FilterChip>}
        {(language || minStars > 0 || archivedOnly || includeDeleted) && (
          <button onClick={clearFilters} className="text-xs text-pink hover:underline">
            clear all
          </button>
        )}
      </div>

      {/* Expandable filter panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="glass mt-4 grid gap-4 rounded-2xl p-5 md:grid-cols-4">
              <label className="block text-xs">
                <span className="mb-1.5 block uppercase tracking-wider text-ink-faint">Language</span>
                <select
                  value={language}
                  onChange={(e) => updateParam("language", e.target.value || null)}
                  className="w-full rounded-lg border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-neon/50"
                >
                  <option value="">Any</option>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="mb-1.5 block uppercase tracking-wider text-ink-faint">Min stars</span>
                <input
                  type="number"
                  min={0}
                  value={minStars || ""}
                  onChange={(e) => updateParam("min_stars", e.target.value || null)}
                  placeholder="0"
                  className="w-full rounded-lg border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-neon/50"
                />
              </label>
              <label className="flex items-center gap-3 text-xs md:col-span-2">
                <input
                  type="checkbox"
                  checked={archivedOnly}
                  onChange={(e) => updateParam("archived_only", e.target.checked ? "true" : null)}
                  className="size-4 accent-cyan-400"
                />
                Only repositories with preserved archives
                <input
                  type="checkbox"
                  checked={includeDeleted}
                  onChange={(e) => updateParam("include_deleted", e.target.checked ? "true" : null)}
                  className="size-4 accent-pink-500"
                />
                Include deleted repos
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <div className="mt-8">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-panel-2/60" />
            ))}
          </div>
        )}

        {error && (
          <div className="glass rounded-2xl border-pink/30 p-8 text-center">
            <p className="text-lg font-semibold text-pink">Something went wrong</p>
            <p className="mt-1 text-sm text-ink-dim">{error}</p>
            <p className="mt-4 text-xs text-ink-faint">
              Is the Salsyx backend running? Start it with{" "}
              <code className="font-mono text-neon">cargo run -p salsyx-api</code>.
            </p>
          </div>
        )}

        {!loading && !error && result && result.items.length === 0 && (
          <div className="glass rounded-2xl p-12 text-center">
            <p className="text-2xl font-bold">No results found</p>
            <p className="mt-2 text-sm text-ink-dim">
              Try a different name, or broaden your filters.
            </p>
          </div>
        )}

        {!loading && !error && result && (
          <>
            <p className="mb-3 text-xs text-ink-faint">
              {result.total.toLocaleString()} results{result.query && ` for “${result.query}”`}
            </p>
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {result.items.map((item) => (
                  <SearchCard key={item.id} item={item} />
                ))}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {result.total > result.per_page && (
              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  disabled={page <= 1}
                  onClick={() => updateParam("page", String(page - 1))}
                  className="grid size-10 place-items-center rounded-full border border-edge text-ink-dim transition-all enabled:hover:border-neon/50 enabled:hover:text-neon disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-sm text-ink-dim">
                  Page {page} of {Math.max(1, Math.ceil(result.total / result.per_page))}
                </span>
                <button
                  disabled={page >= Math.ceil(result.total / result.per_page)}
                  onClick={() => updateParam("page", String(page + 1))}
                  className="grid size-10 place-items-center rounded-full border border-edge text-ink-dim transition-all enabled:hover:border-neon/50 enabled:hover:text-neon disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-neon/40 bg-neon/5 px-3 py-1.5 text-xs text-neon">
      {children}
      <button onClick={onRemove} aria-label="Remove filter" className="hover:text-white">
        <X className="size-3" />
      </button>
    </span>
  );
}

function SearchCard({ item }: { item: SearchItem }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className="group glass relative overflow-hidden rounded-2xl p-5 transition-all hover:border-neon/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://avatars.githubusercontent.com/${item.owner}?v=4&s=48`}
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-full border border-edge"
          />
          <div className="min-w-0">
            <Link
              href={`/repo/${item.owner}/${item.name}`}
              className="block truncate font-mono text-sm font-semibold transition-colors hover:text-neon md:text-base"
            >
              {item.full_name}
            </Link>
            <p className="truncate text-xs text-ink-faint">{item.description ?? "—"}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs text-ink-dim">
          {item.has_archive && (
            <span className="flex items-center gap-1 rounded-full bg-lime/10 px-2.5 py-1 text-lime">
              <Archive className="size-3" /> archived
            </span>
          )}
          {item.is_deleted && (
            <span className="flex items-center gap-1 rounded-full bg-pink/10 px-2.5 py-1 text-pink">
              <Trash2 className="size-3" /> deleted
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-dim">
        {item.language && (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-violet" /> {item.language}
          </span>
        )}
        {item.license && (
          <span className="flex items-center gap-1">
            <Globe className="size-3.5" /> {item.license}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Star className="size-3.5 text-amber" /> {formatNumber(item.stars_count)}
        </span>
        <span className="flex items-center gap-1">
          <GitFork className="size-3.5" /> {formatNumber(item.forks_count)}
        </span>
        {item.archived_at && (
          <span className="text-ink-faint">archived {formatDate(item.archived_at)}</span>
        )}
      </div>
    </motion.div>
  );
}

// Suspense wrapper is the default export (required for useSearchParams).

