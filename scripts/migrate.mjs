/**
 * マイグレーション: レガシーブログデータを Astro Content Collection に変換
 *
 * Usage: node scripts/migrate.mjs
 */
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const LEGACY_DIR = path.join(ROOT, ".legacy");
const METADATA_PATH = path.join(LEGACY_DIR, "lib", "metadata.json");
const PAGES_DIR = path.join(LEGACY_DIR, "lib", "pages");
const FILES_DIR = path.join(LEGACY_DIR, "lib", "pages", "files");

const OUTPUT_CONTENT_DIR = path.join(ROOT, "src", "content", "blog");
const OUTPUT_PUBLIC_FILES = path.join(ROOT, "public", "files");
const OUTPUT_PUBLIC_ASSETS = path.join(ROOT, "public");

/** カスタム Markdown 構文を標準/HTML に変換 */
function convertCustomSyntax(content) {
  // Convert :::...:::  (Mermaid) → ```mermaid code blocks
  content = content.replace(
    /^:::\s*\n([\s\S]*?)\n:::\s*$/gm,
    (match, inner) => {
      return "```mermaid\n" + inner.trim() + "\n```";
    },
  );

  // Convert ^^^SUMMARY...^^^ (Details) → HTML <details><summary>
  content = content.replace(
    /^\^\^\^(.+)\n([\s\S]*?)\n\^\^\^\s*$/gm,
    (match, summary, details) => {
      return `<details><summary>${summary.trim()}</summary>\n\n${details.trim()}\n\n</details>`;
    },
  );

  return content;
}

async function migrate() {
  console.log("🚀 Starting migration...");

  // Read metadata
  const metadata = await fs.readJson(METADATA_PATH);
  console.log(
    `📄 Found ${Object.keys(metadata).length} articles in metadata.json`,
  );

  // Ensure output dirs
  await fs.ensureDir(OUTPUT_CONTENT_DIR);
  await fs.ensureDir(OUTPUT_PUBLIC_FILES);

  // Track migrated count
  let migratedCount = 0;
  let skippedCount = 0;

  for (const [id, meta] of Object.entries(metadata)) {
    // Skip non-public, and articles without dates
    if (!meta.public || !meta.createdAt) {
      console.log(
        `  ⏭️  Skipping "${id}" (public: ${meta.public}, createdAt: ${meta.createdAt})`,
      );
      skippedCount++;
      continue;
    }

    // Read MD file
    const mdPath = path.join(PAGES_DIR, `${id}.md`);
    if (!(await fs.exists(mdPath))) {
      console.log(`  ⚠️  MD file not found for "${id}", skipping`);
      skippedCount++;
      continue;
    }

    let content = await fs.readFile(mdPath, "utf-8");

    // Remove first line if it's the title (# Title)
    const lines = content.split("\n");
    let extractedTitle = meta.title;
    if (lines[0]?.startsWith("# ")) {
      extractedTitle = lines[0].replace(/^#\s+/, "").trim();
      // Remove markdown link syntax from title if present
      const linkMatch = extractedTitle.match(/^\[(.+?)\]\(.+?\)$/);
      if (linkMatch) {
        extractedTitle = linkMatch[1];
      }
      lines.shift();
      // Remove empty line after title
      if (lines[0]?.trim() === "") {
        lines.shift();
      }
    }

    content = lines.join("\n");

    // Convert /b/{id} links to /blog/{id}
    content = content.replace(/\(\/b\//g, "(/blog/");

    // Convert custom markdown syntax
    content = convertCustomSyntax(content);

    // Build frontmatter
    const frontmatter = {
      title: meta.title || extractedTitle,
      description: "",
      pubDate: meta.createdAt,
      ...(meta.updatedAt && { updatedDate: meta.updatedAt }),
      tags: meta.tags || [],
      pinned: meta.pinned || false,
      ...(meta.hidden && { hidden: meta.hidden }),
    };

    const yamlLines = [
      "---",
      `title: ${JSON.stringify(frontmatter.title)}`,
      `description: ${JSON.stringify(frontmatter.description)}`,
      `pubDate: ${JSON.stringify(frontmatter.pubDate)}`,
    ];

    if (frontmatter.updatedDate) {
      yamlLines.push(`updatedDate: ${JSON.stringify(frontmatter.updatedDate)}`);
    }

    yamlLines.push(
      `tags: [${frontmatter.tags.map((t) => JSON.stringify(t)).join(", ")}]`,
    );
    yamlLines.push(`pinned: ${frontmatter.pinned}`);

    if (frontmatter.hidden) {
      yamlLines.push(`hidden: true`);
    }

    yamlLines.push("---");
    yamlLines.push("");

    const outputContent = yamlLines.join("\n") + content;
    const outputPath = path.join(OUTPUT_CONTENT_DIR, `${id}.md`);

    await fs.writeFile(outputPath, outputContent, "utf-8");
    console.log(`  ✅ Migrated "${id}" → ${path.relative(ROOT, outputPath)}`);
    migratedCount++;
  }

  // Copy files directories
  if (await fs.exists(FILES_DIR)) {
    const fileDirs = await fs.readdir(FILES_DIR);
    for (const dir of fileDirs) {
      const srcDir = path.join(FILES_DIR, dir);
      const destDir = path.join(OUTPUT_PUBLIC_FILES, dir);
      const stat = await fs.stat(srcDir);
      if (stat.isDirectory()) {
        await fs.copy(srcDir, destDir, { overwrite: true });
        // Remove manifest.json from public
        const manifestPath = path.join(destDir, "manifest.json");
        if (await fs.exists(manifestPath)) {
          await fs.remove(manifestPath);
        }
        console.log(`  📁 Copied files/${dir} → public/files/${dir}`);
      }
    }
  }

  // Copy blog assets
  const blogAssetsDir = path.join(LEGACY_DIR, "blog-assets");
  if (await fs.exists(blogAssetsDir)) {
    const assets = await fs.readdir(blogAssetsDir);
    for (const asset of assets) {
      await fs.copy(
        path.join(blogAssetsDir, asset),
        path.join(OUTPUT_PUBLIC_ASSETS, asset),
        { overwrite: true },
      );
      console.log(`  🖼️  Copied ${asset} → public/${asset}`);
    }
  }

  console.log(`\n✨ Migration complete!`);
  console.log(`   Migrated: ${migratedCount}`);
  console.log(`   Skipped:  ${skippedCount}`);
}

migrate().catch(console.error);
