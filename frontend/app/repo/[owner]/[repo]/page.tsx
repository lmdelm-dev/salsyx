"use client";

export const runtime = "edge";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
  Archive,
  Star,
  GitFork,
  Download,
  ExternalLink,
  Trash2,
  Clock,
  ShieldCheck,
  FileArchive,
  RefreshCw,
  Github,
  Eye,
  GitCommitHorizontal,
  HardDrive,
} from "lucide-react";
import { api, ApiError, resolveApiUrl } from "@/lib/api";
import {
  formatBytes,
  formatDate,
  formatNumber,
  type RepoResponse,
} from "@/lib/types";
import { ReadmePanel } from "@/components/repo/ReadmePanel";
import { FileTree } from "@/components/repo/FileTree";

const MIN_STARS_FOR_ARCHIVE = 5;

export default function RepoPage() {
  const params = useParams<{ owner: string; repo: string }>();
  const owner = params.owner;
  const repo = params.repo;

  const [result, setResult] = useState<RepoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestDone, setRequestDone] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setRequestDone(false);
    api
      .repo(owner, repo)
      .then(setResult)
      .catch((e: Error) => {
        if (e instanceof ApiError && e.status === 404) {
          // Backend treats "not found + not archived" as 404 with a message.
          setResult({
            source: "salsyx",
            status: "not_found",
            repository: null,
            archive: null,
            download_url: null,
            message: e.message,
          });
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));
  }, [owner, repo]);

  const requestArchive = async () => {
    setRequesting(true);
    setArchiveError(null);
    try {
      await api.requestArchive(`${owner}/${repo}`);
      setRequestDone(true);
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 pb-24 pt-32">
        <div className="space-y-4">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-panel-2/70" />
          <div className="h-40 animate-pulse rounded-2xl bg-panel-2/60" />
          <div className="h-24 animate-pulse rounded-2xl bg-panel-2/60" />
        </div>
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="mx-auto max-w-2xl px-6 pb-24 pt-40 text-center">
        <div className="glass rounded-2xl border-pink/30 p-10">
          <p className="text-xl font-bold text-pink">Unable to resolve repository</p>
          <p className="mt-2 text-sm text-ink-dim">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-32">
      <Breadcrumb owner={owner} repo={repo} />

      {/* Status banner — the whole point of the platform */}
      <StatusBanner result={result} />

      <AnimatePresence mode="wait">
        {result.status === "live" && result.repository && (
          <LiveView
            key="live"
            result={result}
            onRequestArchive={requestArchive}
            requesting={requesting}
            requestDone={requestDone}
            archiveError={archiveError}
          />
        )}
        {result.status === "archived" && result.repository && result.archive && (
          <ArchivedView key="archived" result={result} />
        )}
        {result.status === "not_found" && (
          <NotFoundView
            key="notfound"
            onRequestArchive={requestArchive}
            requesting={requesting}
            requestDone={requestDone}
            archiveError={archiveError}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Breadcrumb({ owner, repo }: { owner: string; repo: string }) {
  return (
    <nav className="mb-6 flex items-center gap-2 text-sm text-ink-faint" aria-label="Breadcrumb">
      <Link href="/" className="transition-colors hover:text-neon">Home</Link>
      <span>/</span>
      <span className="font-mono text-ink-dim">{owner}</span>
      <span>/</span>
      <span className="font-mono text-neon">{repo}</span>
    </nav>
  );
}

function StatusBanner({ result }: { result: RepoResponse }) {
  const isLive = result.status === "live";
  const isArchived = result.status === "archived";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border p-6 backdrop-blur-xl ${
        isLive
          ? "border-lime/30 bg-lime/[0.04]"
          : isArchived
            ? "border-neon/40 bg-neon/[0.05]"
            : "border-pink/30 bg-pink/[0.04]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`grid size-12 place-items-center rounded-xl border ${
            isLive
              ? "border-lime/40 text-lime"
              : isArchived
                ? "border-neon/40 text-neon"
                : "border-pink/40 text-pink"
          }`}
        >
          {isLive ? <Github className="size-6" /> : isArchived ? <Archive className="size-6" /> : <Trash2 className="size-6" />}
        </span>
        <div className="min-w-0">
          <p className="font-mono text-lg font-bold">
            {isLive ? "Alive on GitHub" : isArchived ? "Restored from the archive" : "Not found"}
          </p>
          <p className="text-sm text-ink-dim">
            {isLive
              ? "This repository is live on GitHub right now."
              : isArchived
                ? "Deleted from GitHub — but Salsyx preserved it. Nothing is lost."
                : result.message ?? "GitHub returned 404 and no archive exists yet."}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function LiveView({
  result,
  onRequestArchive,
  requesting,
  requestDone,
  archiveError,
}: {
  result: RepoResponse;
  onRequestArchive: () => void;
  requesting: boolean;
  requestDone: boolean;
  archiveError: string | null;
}) {
  const r = result.repository!;
  const eligible = r.stars_count >= MIN_STARS_FOR_ARCHIVE;
  return (
    <motion.div
      key="live"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
    >
      <div className="glass mt-6 overflow-hidden rounded-2xl">
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.owner.avatar_url ?? `https://avatars.githubusercontent.com/${r.owner.login}?v=4`}
              alt=""
              width={72}
              height={72}
              className="size-16 rounded-2xl border border-edge"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-mono text-2xl font-black">
                {r.owner.login}/<span className="text-gradient">{r.name}</span>
              </h1>
              <p className="mt-1 text-sm text-ink-dim">{r.description ?? "No description"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {r.topics.slice(0, 6).map((t) => (
                  <span key={t} className="rounded-full border border-edge px-2.5 py-0.5 text-xs text-ink-dim">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <a
                href={`https://github.com/${r.full_name}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-glow-cyan"
              >
                Open on GitHub <ExternalLink className="size-4" />
              </a>
              {result.download_url && (
                <a
                  href={resolveApiUrl(result.download_url)}
                  className="flex items-center gap-2 text-xs text-ink-faint transition-colors hover:text-neon"
                >
                  <Download className="size-3.5" /> download zip
                </a>
              )}
            </div>
          </div>

          <StatsGrid
            items={[
              { icon: Star, label: "Stars", value: formatNumber(r.stars_count), color: "text-amber" },
              { icon: GitFork, label: "Forks", value: formatNumber(r.forks_count), color: "text-violet" },
              { icon: Eye, label: "Watchers", value: formatNumber(r.watchers_count), color: "text-neon" },
              { icon: GitCommitHorizontal, label: "Commits", value: formatNumber(r.commit_count), color: "text-lime" },
              { icon: HardDrive, label: "Size", value: formatBytes(r.size_bytes), color: "text-pink" },
              { icon: Clock, label: "Pushed", value: formatDate(r.pushed_at), color: "text-ink-dim" },
            ]}
          />

          <div className="mt-6 rounded-xl border border-edge bg-panel/60 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {eligible ? (
                <p className="text-xs text-ink-dim">
                  <ShieldCheck className="mr-1 inline size-3.5 text-lime" />
                  This repository is live, but you can pre-archive it to guard against future deletion.
                </p>
              ) : (
                <p className="text-xs text-ink-dim">
                  <Star className="mr-1 inline size-3.5 text-amber" />
                  Only repositories with at least {MIN_STARS_FOR_ARCHIVE}+ stars can be archived. This repo has {formatNumber(r.stars_count)}.
                </p>
              )}
              <ArchiveButton
                onClick={onRequestArchive}
                requesting={requesting}
                done={requestDone}
                disabled={!eligible}
              />
            </div>
            {archiveError && (
              <p className="mt-2 text-xs text-pink" role="alert">{archiveError}</p>
            )}
          </div>

          <ReadmePanel owner={r.owner.login} repo={r.name} />
        </div>
      </div>
    </motion.div>
  );
}

function ArchivedView({ result }: { result: RepoResponse }) {
  const r = result.repository!;
  const a = result.archive!;
  return (
    <motion.div
      key="archived"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
    >
      <div className="glass mt-6 overflow-hidden rounded-2xl">
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.owner.avatar_url ?? `https://avatars.githubusercontent.com/${r.owner.login}?v=4`}
              alt=""
              width={72}
              height={72}
              className="size-16 rounded-2xl border border-edge grayscale"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-mono text-2xl font-black">
                {r.owner.login}/<span className="text-gradient">{r.name}</span>
              </h1>
              <p className="mt-1 text-sm text-ink-dim">{r.description ?? "No description"}</p>
              {r.deleted_at && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-pink">
                  <Trash2 className="size-3.5" /> Deleted from GitHub {formatDate(r.deleted_at)}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
                <a
                  href={resolveApiUrl(result.download_url ?? api.downloadUrl(a.id))}
                  className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-glow-cyan"
                >
                <Download className="size-4" /> Download archive
              </a>
              {a.commit_ref && (
                <span className="font-mono text-xs text-ink-faint">
                  ref {a.commit_ref.slice(0, 8)}
                </span>
              )}
            </div>
          </div>

          {/* Archive integrity card */}
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-lime/30 bg-lime/[0.04] p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-lime">
                <ShieldCheck className="size-4" /> Integrity verified
              </p>
              <p className="mt-1.5 break-all font-mono text-[10px] text-ink-faint">{a.checksum}</p>
            </div>
            <div className="rounded-xl border border-edge bg-panel/60 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-dim">
                <FileArchive className="size-4" /> Format
              </p>
              <p className="mt-1.5 font-mono text-sm text-ink">{a.compression}</p>
            </div>
            <div className="rounded-xl border border-edge bg-panel/60 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-dim">
                <Archive className="size-4" /> Archived
              </p>
              <p className="mt-1.5 font-mono text-sm text-ink">{formatDate(a.archived_at)}</p>
              <p className="text-xs text-ink-faint">{formatBytes(a.size_bytes)} preserved</p>
            </div>
          </div>

          <StatsGrid
            items={[
              { icon: Star, label: "Stars at archive", value: formatNumber(r.stars_count), color: "text-amber" },
              { icon: GitFork, label: "Forks", value: formatNumber(r.forks_count), color: "text-violet" },
              { icon: GitCommitHorizontal, label: "Commits captured", value: formatNumber(a.commit_count ?? r.commit_count), color: "text-lime" },
              { icon: HardDrive, label: "Archive size", value: formatBytes(a.size_bytes), color: "text-pink" },
            ]}
          />

          <ReadmePanel owner={r.owner.login} repo={r.name} />

          <FileTree archiveId={a.id} />
        </div>
      </div>
    </motion.div>
  );
}

function NotFoundView({
  onRequestArchive,
  requesting,
  requestDone,
  archiveError,
}: {
  onRequestArchive: () => void;
  requesting: boolean;
  requestDone: boolean;
  archiveError: string | null;
}) {
  return (
    <motion.div
      key="notfound"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="glass mt-6 rounded-2xl p-10 text-center"
    >
      <motion.div
        initial={{ scale: 0.5, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="mx-auto grid size-20 place-items-center rounded-2xl border border-pink/30 bg-pink/[0.06]"
      >
        <Trash2 className="size-9 text-pink" />
      </motion.div>
      <h2 className="mt-6 text-2xl font-black">This repository has not been archived</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-dim">
        GitHub says it doesn&apos;t exist anymore, and Salsyx doesn&apos;t have a preserved
        snapshot yet. That&apos;s exactly the gap we&apos;re closing — request an archive and the
        crawler will preserve it the next time it appears.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3">
        <ArchiveButton onClick={onRequestArchive} requesting={requesting} done={requestDone} />
        {archiveError && (
          <p className="text-xs text-pink" role="alert">{archiveError}</p>
        )}
        <Link
          href="/search"
          className="flex items-center gap-2 rounded-full border border-edge px-5 py-2.5 text-sm text-ink-dim transition-all hover:border-neon/50 hover:text-ink"
        >
          <RefreshCw className="size-4" /> Search again
        </Link>
      </div>
    </motion.div>
  );
}

function ArchiveButton({
  onClick,
  requesting,
  done,
  disabled,
}: {
  onClick: () => void;
  requesting: boolean;
  done: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={requesting || done || disabled}
      className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
        done
          ? "border border-lime/40 bg-lime/10 text-lime"
          : "bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:shadow-glow-cyan disabled:opacity-50 disabled:hover:shadow-none"
      }`}
    >
      {done ? (
        <>
          <ShieldCheck className="size-4" /> Archive requested
        </>
      ) : requesting ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Requesting…
        </>
      ) : disabled ? (
        <>
          <Star className="size-4" /> {MIN_STARS_FOR_ARCHIVE}+ stars required
        </>
      ) : (
        <>
          <Archive className="size-4" /> Request archive
        </>
      )}
    </button>
  );
}

function StatsGrid({
  items,
}: {
  items: { icon: typeof Star; label: string; value: string; color: string }[];
}) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
      {items.map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="rounded-xl border border-edge bg-panel/50 px-4 py-3">
          <Icon className={`size-4 ${color}`} />
          <p className="mt-1.5 text-sm font-bold">{value}</p>
          <p className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
        </div>
      ))}
    </div>
  );
}

