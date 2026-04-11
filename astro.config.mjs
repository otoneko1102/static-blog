// @ts-check

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import { defineConfig } from "astro/config";

import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";

import remarkDetails from "./src/plugins/remark-details.mjs";
import remarkMermaid from "./src/plugins/remark-mermaid.mjs";
import remarkLinkCard from "./src/plugins/remark-link-card.mjs";
import remarkGithubAlerts from "./src/plugins/remark-github-alerts.mjs";
import remarkBreaks from "remark-breaks";
import remarkAutoLink from "./src/plugins/remark-auto-link.mjs";
import remarkUnderline from "./src/plugins/remark-underline.mjs";
import rehypeUnderline from "./src/plugins/rehype-underline.mjs";
import rehypeMedia from "./src/plugins/rehype-media.mjs";
import rehypeExternalLinks from "./src/plugins/rehype-external-links.mjs";
import { SITE_URL } from "./src/consts.ts";

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  integrations: [
    mdx(),
    sitemap(),
    icon({
      include: {
        "material-symbols": ["*"],
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      // Light: github-light  |  Dark: tokyo-night
      // Both have excellent readability and colour contrast.
      themes: {
        light: "github-light",
        dark: "tokyo-night",
      },
      // Let global.css drive dark/light switching via data-theme selector
      // instead of the default prefers-color-scheme media query.
      defaultColor: false,
      wrap: false,
    },
    remarkPlugins: [
      remarkGfm,
      remarkBreaks,
      remarkMath,
      // Must run after remarkGfm so that GFM strikethrough (~~) is
      // resolved first; remarkUnderline then handles any remaining
      // __text__ patterns inside delete nodes and plain text nodes.
      remarkUnderline,
      remarkDetails,
      remarkMermaid,
      remarkGithubAlerts,
      remarkAutoLink,
      remarkLinkCard,
    ],
    rehypePlugins: [
      [rehypeKatex, { strict: false, throwOnError: false }],
      rehypeUnderline, // no-op kept for safety
      rehypeMedia,
      rehypeExternalLinks,
    ],
  },
});
