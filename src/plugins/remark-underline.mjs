/**
 * remark plugin: Proper __underline__ support + orphaned ~~ fix
 *
 * Pass 1 — word-boundary strong nodes from __:
 *   remark-parse already converts __text__ → strong node.
 *   We detect whether the strong came from __ vs ** by inspecting
 *   the source file at the node's start position, then set
 *   data.hName = 'u' so mdast-util-to-hast renders it as <u>.
 *
 * Pass 2 — non-word-boundary __text__ in raw text nodes:
 *   e.g. "日本語__テキスト__日本語" stays as a raw text node because
 *   micromark's flanking-run rules require Unicode alphanumerics NOT to
 *   directly adjoin the __ delimiter.
 *   We visit those text nodes and convert __text__ → <u> HTML nodes.
 *
 * Pass 3 — orphaned ~~ around inline nodes:
 *   GFM strikethrough fails when ~~ is adjacent to punctuation like **,
 *   e.g. "くる~~**脆弱性**~~を" — the ~~ never becomes a del node.
 *   After remark-parse / remarkGfm the AST has:
 *     text("くる~~"), strong("脆弱性"), text("~~を")
 *   We scan paragraph children for this pattern and wrap the inner
 *   nodes inside an HTML <del>…</del> fragment.
 *
 * Place this plugin AFTER remarkGfm in the plugin list.
 */
import { visit } from "unist-util-visit";

// Matches __text__ that was NOT captured by the parser (non-word-boundary).
const UNDERLINE_REGEX = /__([^_\n]+?)__/g;

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Serialise an mdast inline node to an HTML string.
 * Used when we need to wrap already-resolved nodes inside a new HTML shell.
 */
function serializeInline(node) {
  if (!node) return "";
  switch (node.type) {
    case "text":
      return node.value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    case "html":
      return node.value;
    case "inlineCode":
      return `<code>${node.value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</code>`;
    case "strong": {
      const tag = node.data?.hName ?? "strong";
      return `<${tag}>${(node.children ?? []).map(serializeInline).join("")}</${tag}>`;
    }
    case "emphasis":
      return `<em>${(node.children ?? []).map(serializeInline).join("")}</em>`;
    case "delete":
      return `<del>${(node.children ?? []).map(serializeInline).join("")}</del>`;
    case "link": {
      const href = (node.url ?? "").replace(/"/g, "&quot;");
      const title = node.title
        ? ` title="${node.title.replace(/"/g, "&quot;")}"`
        : "";
      return `<a href="${href}"${title}>${(node.children ?? [])
        .map(serializeInline)
        .join("")}</a>`;
    }
    default:
      if (Array.isArray(node.children))
        return node.children.map(serializeInline).join("");
      return node.value ?? "";
  }
}

// ── main plugin ────────────────────────────────────────────────────────────

export default function remarkUnderline() {
  return (tree, file) => {
    const source = String(file.value ?? file);

    // ── Pass 1: strong nodes already created by remark-parse ──────────────
    visit(tree, "strong", (node) => {
      if (!node.position?.start?.offset) return;
      const offset = node.position.start.offset;
      if (offset + 1 >= source.length) return;

      if (source[offset] === "_" && source[offset + 1] === "_") {
        node.data = node.data ?? {};
        node.data.hName = "u";
        node.data.hProperties = node.data.hProperties ?? {};
      }
    });

    // ── Pass 2: text nodes with un-parsed __text__ (non-word boundaries) ──
    visit(tree, "text", (node, index, parent) => {
      if (!parent || typeof index !== "number") return;

      const text = node.value;
      UNDERLINE_REGEX.lastIndex = 0;
      if (!UNDERLINE_REGEX.test(text)) return;
      UNDERLINE_REGEX.lastIndex = 0;

      const children = [];
      let lastIndex = 0;
      let match;

      while ((match = UNDERLINE_REGEX.exec(text)) !== null) {
        if (match.index > lastIndex) {
          children.push({
            type: "text",
            value: text.slice(lastIndex, match.index),
          });
        }
        children.push({
          type: "html",
          value: `<u>${match[1]}</u>`,
        });
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < text.length) {
        children.push({ type: "text", value: text.slice(lastIndex) });
      }

      if (children.length > 0) {
        parent.children.splice(index, 1, ...children);
        return index + children.length;
      }
    });

    // ── Pass 3: orphaned ~~ around inline nodes ────────────────────────────
    // When ~~ is followed/preceded by punctuation (**, __, etc.) the GFM
    // strikethrough tokeniser does not fire. We end up with literal text nodes
    // like "~~" sandwiching strong/em/html nodes inside a paragraph.
    // We scan every block container and collapse those sequences.
    const BLOCK_TYPES = new Set([
      "paragraph",
      "listItem",
      "blockquote",
      "tableCell",
    ]);

    visit(tree, (node) => {
      if (!BLOCK_TYPES.has(node.type) || !Array.isArray(node.children)) return;

      const kids = node.children;
      let i = 0;
      while (i < kids.length) {
        const cur = kids[i];

        // A text node that ends with one or more ~~ pairs
        if (cur.type !== "text") {
          i++;
          continue;
        }

        const openMatch = cur.value.match(/^([\s\S]*?)(~~+)$/);
        if (!openMatch) {
          i++;
          continue;
        }

        const tildes = openMatch[2]; // e.g. "~~"
        const beforeTildes = openMatch[1]; // text before the tildes

        // Collect consecutive non-text inline nodes until we find a text that
        // starts with the same tilde string.
        let j = i + 1;
        const inner = [];
        let closeNode = null;
        let afterTildes = "";

        while (j < kids.length) {
          const candidate = kids[j];

          if (candidate.type === "text") {
            // Use startsWith to avoid template-literal regex escape issues
            if (candidate.value.startsWith(tildes)) {
              afterTildes = candidate.value.slice(tildes.length);
              closeNode = candidate;
            }
            break; // stop at the first text node regardless
          }

          inner.push(candidate);
          j++;
        }

        if (!closeNode || inner.length === 0) {
          i++;
          continue;
        }

        // Build the replacement nodes
        const replacement = [];

        // text before the opening tildes
        if (beforeTildes) {
          replacement.push({ type: "text", value: beforeTildes });
        }

        // <del> wrapping the inner nodes serialised as HTML
        const innerHtml = inner.map(serializeInline).join("");
        replacement.push({ type: "html", value: `<del>${innerHtml}</del>` });

        // text after the closing tildes
        if (afterTildes) {
          replacement.push({ type: "text", value: afterTildes });
        }

        // Splice: remove cur (i), inner nodes (i+1…j-1), closeNode (j)
        kids.splice(i, j - i + 1, ...replacement);

        // Don't advance i — the replacement nodes may themselves need scanning
      }
    });
  };
}
