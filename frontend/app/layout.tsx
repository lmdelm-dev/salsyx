import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SmoothScrollProvider } from "@/components/SmoothScroll";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://salsyx.pages.dev"),
  title: {
    default: "Salsyx — nothing open-source should disappear forever",
    template: "%s · Salsyx",
  },
  description:
    "Search and preservation platform for public GitHub repositories. Browse, download, and archive code before it disappears.",
  keywords: ["github", "archive", "preservation", "open source", "search", "code archive"],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "anKliEWwotQF9V49Cnvg32my5DfxH-XcjI8MCHVNHEU",
  },
  openGraph: {
    title: "Salsyx",
    description: "Nothing open-source should disappear forever.",
    type: "website",
    url: "https://salsyx.pages.dev/",
    siteName: "Salsyx",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Salsyx",
    description: "Nothing open-source should disappear forever.",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#06070b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Salsyx",
              url: "https://salsyx.pages.dev/",
              description:
                "Nothing open-source should disappear forever. Search, browse, download, and archive public GitHub repositories.",
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: "https://salsyx.pages.dev/search?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
        <SmoothScrollProvider>
          <Nav />
          <main className="relative z-10 min-h-screen">{children}</main>
          <Footer />
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
