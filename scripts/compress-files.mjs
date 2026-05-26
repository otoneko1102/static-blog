#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const publicFilesDir = path.join(rootDir, "public", "files");

function getCurrentBranchArticleId() {
  try {
    const branch = execSync("git branch --show-current", {
      cwd: rootDir,
      encoding: "utf-8",
    }).trim();
    const m = branch.match(/^article\/(.+)$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function resolveArticleId(argv) {
  const explicit = argv[2];
  if (explicit) return explicit;
  const branchId = getCurrentBranchArticleId();
  if (!branchId) {
    throw new Error(
      "記事IDが指定されておらず、現在のブランチも 'article/<id>' 形式ではありません。\n" +
        "  使い方: pnpm comp <id>  または  article/<id> ブランチに切り替えてください。",
    );
  }
  return branchId;
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function walkFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}

async function compressFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);
  const originalSize = buf.length;
  let outBuf = null;

  try {
    if (ext === ".png") {
      // ロスレス：アダプティブフィルタ＋最大圧縮
      outBuf = await sharp(buf, { animated: true })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    } else if ([".jpg", ".jpeg", ".jpe", ".jfif"].includes(ext)) {
      // JPEG: mozjpeg エンコーダで品質88 (元が低品質なら再エンコで大きくなる可能性があるためサイズチェック)
      outBuf = await sharp(buf)
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
    } else {
      // WebP / AVIF / GIF / APNG / 動画 / 音声 / PDF → スキップ
      return null;
    }
  } catch {
    return null;
  }

  if (!outBuf || outBuf.length >= originalSize) return null;

  fs.writeFileSync(filePath, outBuf);
  return { originalSize, newSize: outBuf.length, saved: originalSize - outBuf.length };
}

async function main() {
  const id = resolveArticleId(process.argv);

  const articleDir = path.join(publicFilesDir, id);
  if (!fs.existsSync(articleDir)) {
    console.error(`エラー: ディレクトリが見つかりません: ${articleDir}`);
    process.exit(1);
  }

  console.log(`[記事ID] ${id}`);
  console.log(`[対象]   ${path.relative(rootDir, articleDir).replace(/\\/g, "/")}/`);
  console.log("");

  const allFiles = walkFiles(articleDir);
  let totalOriginal = 0;
  let totalNew = 0;
  let compressedCount = 0;
  let skippedCount = 0;

  for (const filePath of allFiles) {
    const relPath = path.relative(articleDir, filePath).replace(/\\/g, "/");
    const result = await compressFile(filePath);
    if (result) {
      const pct = ((result.saved / result.originalSize) * 100).toFixed(1);
      console.log(
        `  ✓ ${relPath}  ${formatSize(result.originalSize)} → ${formatSize(result.newSize)} (-${pct}%)`,
      );
      totalOriginal += result.originalSize;
      totalNew += result.newSize;
      compressedCount++;
    } else {
      const size = fs.statSync(filePath).size;
      totalOriginal += size;
      totalNew += size;
      skippedCount++;
    }
  }

  console.log("");
  console.log(`完了: ${compressedCount} 件圧縮, ${skippedCount} 件スキップ`);
  if (compressedCount > 0) {
    const totalSaved = totalOriginal - totalNew;
    const pct = ((totalSaved / totalOriginal) * 100).toFixed(1);
    console.log(`合計削減: ${formatSize(totalSaved)} (-${pct}%)`);
  }
}

main().catch((err) => {
  console.error("エラー:", err?.message ?? err);
  process.exit(1);
});
