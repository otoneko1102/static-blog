/**
 * remark plugin: OGP link card embeds via @[](url) syntax
 *
 * Detects paragraphs of the form:
 *   @[](https://example.com)
 *   @[Custom title](https://example.com)
 *
 * At build time, fetches OGP metadata (title, description, og:image,
 * og:site_name) and renders a rich link card embed.
 * Falls back gracefully when the URL is unreachable or returns no OGP data.
 */
import { visit } from "unist-util-visit";

// Build-time in-memory cache — avoids duplicate fetches within one build
const ogpCache = new Map();

// ── helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract a single <meta> content value by property or name. */
function getMeta(html, ...properties) {
  for (const prop of properties) {
    const escaped = escapeRegex(prop);
    // property/name before content
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"'<>]+)["']`,
      "i",
    );
    // content before property/name
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"'<>]+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i",
    );
    const m = html.match(re1) ?? html.match(re2);
    if (m) return m[1].trim();
  }
  return null;
}

async function fetchOgp(url) {
  if (ogpCache.has(url)) return ogpCache.get(url);

  let result = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LinkCard/1.0; +https://blog.montblank.fun)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      ogpCache.set(url, null);
      return null;
    }

    const html = await res.text();

    const title =
      getMeta(html, "og:title", "twitter:title") ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ??
      url;

    const description =
      getMeta(html, "og:description", "twitter:description", "description") ??
      "";

    const image =
      getMeta(html, "og:image", "og:image:secure_url", "twitter:image") ??
      null;

    const siteName =
      getMeta(html, "og:site_name") ??
      (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      })();

    result = { title, description, image, siteName };
  } catch {
    result = null;
  }

  ogpCache.set(url, result);
  return result;
}

// ── card builder ─────────────────────────────────────────────────────────────

/**
 * Build a mdxJsxFlowElement node tree — the only HTML injection method that
 * @astrojs/mdx accepts from remark plugins (avoids the "unknown node raw" error
 * that arises from type:"html" MDAST → type:"raw" hast → MDX compile failure).
 */
function jsxAttr(name, value) {
  return { type: "mdxJsxAttribute", name, value: String(value) };
}

function jsxElem(name, attrPairs, children) {
  return {
    type: "mdxJsxFlowElement",
    name,
    attributes: (attrPairs ?? []).map(([n, v]) => jsxAttr(n, v)),
    children: children ?? [],
  };
}

function buildCard(ogp, url, customLabel) {
  const title = customLabel || ogp?.title || url;
  const description = ogp?.description?.trim() || "";
  const image = ogp?.image || null;
  const siteName =
    ogp?.siteName ||
    (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    })();

  const t = (val) => ({ type: "text", value: val });

  const textChildren = [
    jsxElem("p", [["class", "link-card-title"]], [t(title)]),
    ...(description
      ? [jsxElem("p", [["class", "link-card-description"]], [t(description)])]
      : []),
    jsxElem("p", [["class", "link-card-sitename"]], [t(siteName)]),
  ];

  const imgElem = image
    ? jsxElem("img", [
        ["class", "link-card-image"],
        ["src", image],
        ["alt", ""],
        ["loading", "lazy"],
        ["decoding", "async"],
      ])
    : jsxElem("div", [["class", "link-card-image link-card-image--none"]]);

  return jsxElem(
    "a",
    [
      ["class", "link-card"],
      ["href", url],
      ["target", "_blank"],
      ["rel", "noopener noreferrer"],
    ],
    [
      jsxElem("div", [["class", "link-card-body"]], [
        jsxElem("div", [["class", "link-card-text"]], textChildren),
        imgElem,
      ]),
    ]
  );
}

// ── helpers: paragraph splitting ─────────────────────────────────────────────

/** Split paragraph children into "lines" delimited by <break> nodes. */
function splitByBreaks(children) {
  const lines = [];
  let current = [];
  for (const child of children) {
    if (child.type === "break") {
      lines.push(current);
      current = [];
    } else {
      current.push(child);
    }
  }
  lines.push(current);
  return lines;
}

/** True when a line is exactly the @[...](url) link-card pattern. */
function isCardLine(line) {
  const m = line.filter((c) => !(c.type === "text" && c.value === ""));
  return (
    m.length === 2 &&
    m[0].type === "text" &&
    m[0].value === "@" &&
    m[1].type === "link" &&
    /^https?:\/\//.test(m[1].url)
  );
}

function getCardInfo(line) {
  const m = line.filter((c) => !(c.type === "text" && c.value === ""));
  const link = m[1];
  const label =
    link.children
      .filter((c) => c.type === "text")
      .map((c) => c.value)
      .join("") || null;
  return { url: link.url, label };
}

// ── main plugin ──────────────────────────────────────────────────────────────

export default function remarkLinkCard() {
  return async (tree) => {
    const tasks = [];

    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || index == null) return;

      const lines = splitByBreaks(node.children);

      // Skip paragraphs with no card lines
      if (!lines.some(isCardLine)) return;

      // Build segments: {type:"card", url, label} | {type:"text", nodes[]}
      const segments = lines.map((line) => {
        if (isCardLine(line)) {
          return { type: "card", ...getCardInfo(line) };
        }
        const hasContent = line.some(
          (c) => !(c.type === "text" && c.value.trim() === ""),
        );
        return { type: "text", nodes: line, hasContent };
      });

      tasks.push({ node, parent, segments });
    });

    await Promise.all(
      tasks.map(async ({ node, parent, segments }) => {
        const replacements = [];
        let textBuffer = []; // accumulate consecutive text-lines

        const flushText = () => {
          if (textBuffer.length === 0) return;
          const paraChildren = [];
          for (let i = 0; i < textBuffer.length; i++) {
            if (i > 0) paraChildren.push({ type: "break" });
            paraChildren.push(...textBuffer[i]);
          }
          replacements.push({ type: "paragraph", children: paraChildren });
          textBuffer = [];
        };

        for (const seg of segments) {
          if (seg.type === "card") {
            flushText();
            console.log(`[link-card] Fetching OGP: ${seg.url}`);
            const ogp = await fetchOgp(seg.url);
            replacements.push(buildCard(ogp, seg.url, seg.label));
          } else if (seg.hasContent) {
            textBuffer.push(seg.nodes);
          }
        }
        flushText();

        const i = parent.children.indexOf(node);
        if (i !== -1) parent.children.splice(i, 1, ...replacements);
      }),
    );
  };
}
