/**
 * rehype plugin: Extend image syntax for media embeds
 *
 * Type detection priority (highest → lowest):
 *   1. data-type attribute  (MDX: <img src="…" data-type="video" />)
 *   2. title attribute      (Markdown: ![alt](url "video"))
 *   3. URL extension        (legacy fallback: .mp4, .mp3, .pdf …)
 *
 * Supported type values (case-insensitive):
 *   video    → <video controls>
 *   audio    → <audio controls>
 *   pdf      → <iframe> PDF embed
 *   youtube  → YouTube iframe
 *   twitter / x → Twitter/X blockquote embed
 *
 * URL-based auto-detection (still used when no explicit type is set):
 *   youtube.com / youtu.be → youtube
 *   twitter.com / x.com status → twitter
 *   extension-based MIME mapping → video / audio / pdf
 */
import { visit } from "unist-util-visit";

// ── MIME / extension tables ──────────────────────────────────────────────────

const EXT_TO_TYPE = {
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".avi": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".ogg": "audio",
  ".m4a": "audio",
  ".pdf": "pdf",
};

const KNOWN_TYPES = new Set([
  "video",
  "audio",
  "pdf",
  "youtube",
  "twitter",
  "x",
]);

// ── helpers ──────────────────────────────────────────────────────────────────

function getExtension(url) {
  try {
    const pathname = new URL(url, "https://example.com").pathname;
    const dot = pathname.lastIndexOf(".");
    return dot >= 0 ? pathname.slice(dot).toLowerCase() : "";
  } catch {
    return "";
  }
}

function isYouTubeUrl(url) {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/.test(
    url,
  );
}

function getYouTubeId(url) {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/,
  );
  return m ? m[1] : null;
}

function isTwitterUrl(url) {
  return /(?:twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url);
}

/**
 * Resolve the media type for a given img node.
 *
 * Checks (in order):
 *   1. data-type attribute on the element
 *   2. title attribute used as a type keyword
 *   3. URL-based auto-detection (YouTube / Twitter patterns, then extension)
 */
function resolveType(src, properties) {
  // 1. Explicit data-type attribute
  const explicit = (properties.dataType ?? properties["data-type"] ?? "")
    .toString()
    .toLowerCase()
    .trim();
  if (explicit && KNOWN_TYPES.has(explicit)) return explicit;

  // 2. Title attribute used as type keyword
  const titleHint = (properties.title ?? "").toString().toLowerCase().trim();
  if (titleHint && KNOWN_TYPES.has(titleHint)) return titleHint;

  // 3. URL-based detection
  if (isYouTubeUrl(src)) return "youtube";
  if (isTwitterUrl(src)) return "twitter";

  const ext = getExtension(src);
  return EXT_TO_TYPE[ext] ?? null; // null → treat as plain image
}

// ── builders ─────────────────────────────────────────────────────────────────

function buildVideo(src, alt) {
  return {
    type: "element",
    tagName: "video",
    properties: {
      src,
      controls: true,
      preload: "metadata",
      className: ["media-video"],
      title: alt || undefined,
    },
    children: [
      { type: "text", value: "お使いのブラウザは動画タグに対応していません。" },
    ],
  };
}

function buildAudio(src) {
  return {
    type: "element",
    tagName: "audio",
    properties: {
      src,
      controls: true,
      preload: "metadata",
      className: ["media-audio"],
    },
    children: [
      { type: "text", value: "お使いのブラウザは音声タグに対応していません。" },
    ],
  };
}

function buildPdf(src, alt) {
  const label = alt || "PDF";
  // Desktop: iframe embed
  // Mobile: fallback card with a direct link (iOS Safari / Android cannot
  //         reliably render PDFs inside iframes)
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["pdf-embed"] },
    children: [
      // ── desktop iframe ──────────────────────────────────────────────
      {
        type: "element",
        tagName: "div",
        properties: { className: ["pdf-desktop"] },
        children: [
          {
            type: "element",
            tagName: "iframe",
            properties: {
              src,
              width: "100%",
              height: "600",
              style: "border: none; border-radius: 8px; display: block;",
              title: label,
            },
            children: [],
          },
        ],
      },
      // ── mobile fallback card ─────────────────────────────────────────
      {
        type: "element",
        tagName: "div",
        properties: { className: ["pdf-mobile"] },
        children: [
          {
            type: "element",
            tagName: "a",
            properties: {
              href: src,
              target: "_blank",
              rel: ["noopener", "noreferrer"],
              className: ["pdf-link"],
            },
            children: [
              {
                type: "element",
                tagName: "iconify-icon",
                properties: {
                  icon: "material-symbols:picture-as-pdf",
                  width: "32",
                  height: "32",
                  "aria-hidden": "true",
                },
                children: [],
              },
              {
                type: "element",
                tagName: "span",
                properties: { className: ["pdf-link-label"] },
                children: [{ type: "text", value: label }],
              },
              {
                type: "element",
                tagName: "span",
                properties: { className: ["pdf-link-hint"] },
                children: [{ type: "text", value: "タップして PDF を開く" }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildYouTube(src, alt) {
  const videoId = getYouTubeId(src);
  if (!videoId) return null;
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["youtube-embed"] },
    children: [
      {
        type: "element",
        tagName: "iframe",
        properties: {
          src: `https://www.youtube-nocookie.com/embed/${videoId}`,
          width: "100%",
          height: "400",
          frameBorder: "0",
          allow:
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowFullscreen: true,
          style: "border: none; border-radius: 8px; aspect-ratio: 16/9;",
          title: alt || "YouTube Video",
        },
        children: [],
      },
    ],
  };
}

function buildTwitter(src) {
  return {
    type: "raw",
    value: `<div class="twitter-embed"><blockquote class="twitter-tweet" data-theme="dark"><a href="${src}">Tweet</a></blockquote></div>`,
  };
}

// ── main plugin ──────────────────────────────────────────────────────────────

export default function rehypeMedia() {
  return (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "img") return;

      const src = node.properties?.src ?? "";
      const alt = node.properties?.alt ?? "";
      if (!src) return;

      const type = resolveType(src, node.properties ?? {});

      let replacement = null;

      switch (type) {
        case "video":
          replacement = buildVideo(src, alt);
          break;
        case "audio":
          replacement = buildAudio(src);
          break;
        case "pdf":
          replacement = buildPdf(src, alt);
          break;
        case "youtube":
          replacement = buildYouTube(src, alt);
          break;
        case "twitter":
        case "x":
          replacement = buildTwitter(src);
          break;
        default:
          // Plain image — leave the <img> as-is
          return;
      }

      if (replacement) {
        parent.children[index] = replacement;
      }
    });
  };
}
