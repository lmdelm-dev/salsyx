import type { MetadataRoute } from "next";

export const runtime = "edge";

const ORIGIN = "https://salsyx.pages.dev";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${ORIGIN}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${ORIGIN}/search`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  // Surface the top archived repos so search engines can index the
  // preservation database directly. Falls back to static routes only if the
  // API is unreachable at build time.
  try {
    const res = await fetch("https://salsyx-api.fly.dev/api/v1/stats/top", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as { top_repositories?: { full_name?: string }[] };
      for (const repo of data.top_repositories ?? []) {
        if (!repo.full_name) continue;
        const [owner, name] = repo.full_name.split("/");
        if (!owner || !name) continue;
        entries.push({
          url: `${ORIGIN}/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }
  } catch {
    // API unavailable — static entries alone are fine.
  }

  return entries;
}