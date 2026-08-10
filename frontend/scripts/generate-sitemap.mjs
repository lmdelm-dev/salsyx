// Generate a static sitemap.xml at build time and write it into the
// next-on-pages output dir. Serving a static file is far more reliable for
// search-engine crawlers than a Worker who re-fetches the API per request.
//
// Usage:
//   node scripts/generate-sitemap.mjs [outDir]
//   (outDir defaults to .vercel/output/static)

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ORIGIN = "https://salsyx.pages.dev";
const API = "https://salsyx-api.fly.dev/api/v1/stats/top";
const OUT_DIR = process.argv[2] ? resolve(process.argv[2]) : resolve(".vercel/output/static");
const OUT_FILE = resolve(OUT_DIR, "sitemap.xml");

async function buildSitemap() {
  const now = new Date().toISOString();
  const urls = [
    { loc: `${ORIGIN}/`, lastmod: now, freq: "daily", prio: "1.0" },
    { loc: `${ORIGIN}/search`, lastmod: now, freq: "daily", prio: "0.8" },
  ];

  try {
    const res = await fetch(API, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      for (const repo of data.top_repositories ?? []) {
        const full = repo.full_name;
        if (typeof full !== "string") continue;
        const [owner, name] = full.split("/");
        if (!owner || !name) continue;
        urls.push({
          loc: `${ORIGIN}/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
          lastmod: now,
          freq: "weekly",
          prio: "0.6",
        });
      }
    } else {
      console.warn(`[sitemap] API ${res.status} — using static URLs only`);
    }
  } catch (e) {
    console.warn(`[sitemap] API unreachable — using static URLs only (${e.message})`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.prio}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

  await writeFile(OUT_FILE, xml, "utf8");
  console.log(`[sitemap] wrote ${OUT_FILE} (${urls.length} URLs)`);
}

buildSitemap().catch((e) => {
  console.error("[sitemap] failed:", e);
  process.exit(1);
});