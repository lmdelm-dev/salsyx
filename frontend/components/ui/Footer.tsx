"use client";

import { Heart } from "lucide-react";
import { openApiUrl } from "@/lib/api";

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-edge bg-panel/40 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-10 md:flex-row">
        <div>
          <p className="text-sm font-semibold">
            Sal<span className="text-gradient">syx</span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
            Made by Jamal Tiliouan &amp; Salma Zelmati with <Heart className="size-3 fill-pink text-pink" /> for the open-source community
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-dim">
          <a href="/search" className="transition-colors hover:text-neon">
            Search
          </a>
          <a
            href={openApiUrl()}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-neon"
          >
            API
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-neon"
          >
            GitHub
          </a>
        </div>

        <p className="text-xs text-ink-faint">
          Nothing open-source should disappear forever. v0.1.0
        </p>
      </div>
    </footer>
  );
}
