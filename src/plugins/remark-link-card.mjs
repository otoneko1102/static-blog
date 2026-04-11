/**
 * remark: @[](url) 構文で OGP リンクカードを埋め込み
 * ビルド時に OGP メタデータを取得してリッチカードを生成。
 */
import fs from "fs";
import path from "path";
import { visit } from "unist-util-visit";

// ビルド時キャッシュ
const ogpCache = new Map();

// サイトオリジン取得
function resolveSiteOrigin() {
  const fromEnv =
    (typeof process !== "undefined" && process.env.SITE) ||
    (typeof import.meta !== "undefined" && import.meta.env?.SITE);
  if (fromEnv) return fromEnv;

  try {
    const configPath = path.resolve(process.cwd(), "astro.config.mjs");
    const configText = fs.readFileSync(configPath, "utf8");
    const match = configText.match(/\bsite\s*:\s*["']([^"']+)["']/);
    if (match) return match[1];
  } catch {
    // ignore
  }

  return "";
}

const SITE_ORIGIN = resolveSiteOrigin();

// ヘルパー

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** HTML エンティティをデコード */
function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** <meta> の content 値を抽出 */
function getMeta(html, ...properties) {
  for (const prop of properties) {
    const escaped = escapeRegex(prop);
    // property/name before content  (try double-quoted then single-quoted content)
    const re1d = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content="([^"<>]*)"`,
      "i",
    );
    const re1s = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content='([^'<>]*)'`,
      "i",
    );
    // content before property/name
    const re2d = new RegExp(
      `<meta[^>]+content="([^"<>]*)"[^>]+(?:property|name)=["']${escaped}["']`,
      "i",
    );
    const re2s = new RegExp(
      `<meta[^>]+content='([^'<>]*)'[^>]+(?:property|name)=["']${escaped}["']`,
      "i",
    );
    const m = html.match(re1d) ?? html.match(re1s) ?? html.match(re2d) ?? html.match(re2s);
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
        "User-Agent": "Mozilla/5.0 (compatible; LinkCard/1.0)",
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
      getMeta(html, "og:image", "og:image:secure_url", "twitter:image") ?? null;

    const siteName =
      getMeta(html, "og:site_name") ??
      (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      })();

    result = {
      title: decodeHtmlEntities(title),
      description: decodeHtmlEntities(description),
      image,
      siteName: decodeHtmlEntities(siteName),
    };
  } catch {
    result = null;
  }

  ogpCache.set(url, result);
  return result;
}

// カードビルダー

/**
 * mdxJsxFlowElement ノードを構築。
 * @astrojs/mdx が remark プラグインから受け付ける唯一の HTML 注入方法。
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
      jsxElem(
        "div",
        [["class", "link-card-body"]],
        [jsxElem("div", [["class", "link-card-text"]], textChildren), imgElem],
      ),
    ],
  );
}

// ヘルパー: paragraph 分割

/** break ノードで行に分割 */
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

/** @[...](url) パターンにマッチするか */
function isCardLine(line) {
  const m = line.filter((c) => !(c.type === "text" && c.value === ""));
  return (
    m.length === 2 &&
    m[0].type === "text" &&
    m[0].value === "@" &&
    m[1].type === "link" && // remote URLs or local site paths
    (/^https?:\/\//.test(m[1].url) || /^\//.test(m[1].url))
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

function resolveUrlForOgp(url) {
  if (/^\//.test(url)) {
    return `${SITE_ORIGIN.replace(/\/$/, "")}${url}`;
  }
  return url;
}

// メインプラグイン

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
            const isRemote = /^https?:\/\//.test(seg.url);
            const isLocal = /^\//.test(seg.url);

            const ogpUrl = isLocal ? resolveUrlForOgp(seg.url) : seg.url;
            const shouldFetch = isRemote || (isLocal && SITE_ORIGIN);
            const ogp = shouldFetch ? await fetchOgp(ogpUrl) : null;
            if (shouldFetch) console.log(`[link-card] Fetching OGP: ${ogpUrl}`);

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
