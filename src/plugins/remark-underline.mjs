/**
 * remark plugin: Proper __underline__ support
 *
 * Three passes:
 *
 * Pass 1 — strong nodes that came from __:
 *   remark-gfm parses __text__ → strong, just like **text**.
 *   We distinguish them by looking at source[start..start+2].
 *   Works for __STR1**STR2**STR3__ (outer __ wraps entire strong).
 *
 * Pass 2 — plain text nodes with literal __…__:
 *   When __ flanking rules fail (e.g. Japanese on both sides),
 *   remark leaves the raw text. We regex-replace those.
 *
 * Pass 3 — cross-node __ pairs in a paragraph:
 *   Case: __Japanese<strong>text</strong>more__ stays as separate
 *   text/strong nodes because the __ was eaten partially into text.
 *   We tokenize paragraph children by splitting text on "__",
 *   locate paired markers, and serialize the span as <u>…</u>.
 *
 * Pass 4 — orphaned ~~ around inline nodes (GFM strikethrough edge case).
 *
 * Place this plugin AFTER remarkGfm in the plugin list.
 */
import { visit } from "unist-util-visit";

// Matches plain-text __…__ that the parser left as raw text (non-word-boundary).
const UNDERLINE_PLAIN_REGEX = /__([^_\n]+?)__/g;

export default function remarkUnderline() {
  return (tree, file) => {
    const source = String(file.value ?? file);

    // ── Pass 1: strong nodes already created by remark-parse ──────────────
    // Detect whether delimiter is __ (underline) or ** (bold) by reading
    // the file source at the node's character offset.
    visit(tree, "strong", (node) => {
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      if (typeof start !== "number" || typeof end !== "number") return;

      // The position range covers the delimiters themselves.
      // Check the first 2 chars of the range for "__".
      const startDelim = source.slice(start, start + 2);
      const endDelim = source.slice(end - 2, end);

      if (startDelim === "__" && endDelim === "__") {
        node.data = node.data ?? {};
        node.data.hName = "u";
        node.data.hProperties = node.data.hProperties ?? {};
      }
    });

    // ── Pass 2: text nodes with un-parsed __text__ (non-word boundaries) ──
    // e.g. "日本語__テキスト__日本語" stays as plain text because micromark's
    // flanking-run rules require Unicode alphanumerics NOT to adjoin __.
    visit(tree, "text", (node, index, parent) => {
      if (!parent || typeof index !== "number") return;

      const text = node.value;
      UNDERLINE_PLAIN_REGEX.lastIndex = 0;
      if (!UNDERLINE_PLAIN_REGEX.test(text)) return;
      UNDERLINE_PLAIN_REGEX.lastIndex = 0;

      const children = [];
      let lastIndex = 0;
      let match;

      while ((match = UNDERLINE_PLAIN_REGEX.exec(text)) !== null) {
        if (match.index > lastIndex) {
          children.push({ type: "text", value: text.slice(lastIndex, match.index) });
        }
        children.push({ type: "html", value: `<u>${match[1]}</u>` });
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

    // ── Pass 3: cross-node __ pairs in a paragraph ────────────────────────
    // Handles cases like:
    //   __Japanese<strong>text</strong>more__
    // which remark leaves as: text("__Japanese"), strong("text"), text("more__")
    // We tokenize the whole paragraph's children by splitting text nodes on "__",
    // then wrap everything between paired markers into <u>…</u>.
    const BLOCK_TYPES = new Set([
      "paragraph",
      "listItem",
      "blockquote",
      "tableCell",
    ]);

    visit(tree, (node) => {
      if (!BLOCK_TYPES.has(node.type) || !Array.isArray(node.children)) return;

      // Tokenize: each child → one or more tokens
      // token types: { kind: "marker" } | { kind: "text", value } | { kind: "node", node }
      const tokens = [];
      for (const child of node.children) {
        if (child.type === "text") {
          const parts = child.value.split("__");
          for (let p = 0; p < parts.length; p++) {
            if (p > 0) tokens.push({ kind: "marker" });
            if (parts[p] !== "") tokens.push({ kind: "text", value: parts[p] });
          }
        } else {
          tokens.push({ kind: "node", node: child });
        }
      }

      // Count markers; if fewer than 2 there's nothing to do
      const markerCount = tokens.filter((t) => t.kind === "marker").length;
      if (markerCount < 2) return;

      // Build output by pairing markers
      const out = [];
      let buffer = null; // null = outside underline, [] = collecting inside underline

      for (const tok of tokens) {
        if (tok.kind === "marker") {
          if (buffer === null) {
            // Start collecting underline content
            buffer = [];
          } else {
            // Close underline: serialize buffer as <u>…</u>
            const inner = buffer.map((t) =>
              t.kind === "text"
                ? serializeInline({ type: "text", value: t.value })
                : serializeInline(t.node)
            ).join("");
            out.push({ type: "html", value: `<u>${inner}</u>` });
            buffer = null;
          }
          continue;
        }

        if (buffer !== null) {
          buffer.push(tok);
        } else {
          // Outside underline — emit as original node type
          if (tok.kind === "node") out.push(tok.node);
          else out.push({ type: "text", value: tok.value });
        }
      }

      // Unclosed marker: treat the opening __ as literal text
      if (buffer !== null) {
        out.push({ type: "text", value: "__" });
        for (const t of buffer) {
          if (t.kind === "node") out.push(t.node);
          else out.push({ type: "text", value: t.value });
        }
      }

      // Only replace if something actually changed
      const changed =
        out.length !== node.children.length ||
        out.some((o, i) => o !== node.children[i]);
      if (changed) node.children = out;
    });

    // ── Pass 4: orphaned ~~ around inline nodes ────────────────────────────
    // When ~~ is followed/preceded by punctuation (**, __, etc.) the GFM
    // strikethrough tokeniser does not fire. We end up with literal text nodes
    // like "~~" sandwiching strong/em/html nodes inside a paragraph.
    // We scan every block container and collapse those sequences.
    visit(tree, (node) => {
      if (!BLOCK_TYPES.has(node.type) || !Array.isArray(node.children)) return;

      const kids = node.children;
      let i = 0;
      while (i < kids.length) {
        const cur = kids[i];

        if (cur.type !== "text") { i++; continue; }

        const openMatch = cur.value.match(/^([\s\S]*?)(~~+)$/);
        if (!openMatch) { i++; continue; }

        const tildes = openMatch[2];
        const beforeTildes = openMatch[1];

        let j = i + 1;
        const inner = [];
        let closeNode = null;
        let afterTildes = "";

        while (j < kids.length) {
          const candidate = kids[j];
          if (candidate.type === "text") {
            if (candidate.value.startsWith(tildes)) {
              afterTildes = candidate.value.slice(tildes.length);
              closeNode = candidate;
            }
            break;
          }
          inner.push(candidate);
          j++;
        }

        if (!closeNode || inner.length === 0) { i++; continue; }

        const replacement = [];
        if (beforeTildes) replacement.push({ type: "text", value: beforeTildes });

        const innerHtml = inner.map(serializeInline).join("");
        replacement.push({ type: "html", value: `<del>${innerHtml}</del>` });

        if (afterTildes) replacement.push({ type: "text", value: afterTildes });

        kids.splice(i, j - i + 1, ...replacement);
        // Don't advance — replacement may need further scanning
      }
    });
  };
}

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
