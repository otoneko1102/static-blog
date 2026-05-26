#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const blogDir = path.join(rootDir, "src", "content", "blog");

const VALID_FIELDS = new Set(["pubDate", "updatedDate"]);

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

function resolveArticleId(explicit, field) {
  if (explicit) return explicit;
  const branchId = getCurrentBranchArticleId();
  if (!branchId) {
    throw new Error(
      `記事IDが指定されておらず、現在のブランチも 'article/<id>' 形式ではありません。\n` +
        `  使い方: pnpm date:${field === "pubDate" ? "pub" : "updated"} <id>` +
        `  または article/<id> ブランチに切り替えてください。`,
    );
  }
  return branchId;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatJstNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jst = new Date(utc + 9 * 60 * 60000);
  return (
    `${jst.getFullYear()}-${pad(jst.getMonth() + 1)}-${pad(jst.getDate())} ` +
    `${pad(jst.getHours())}:${pad(jst.getMinutes())}`
  );
}

function updateFrontmatterField(text, field, value) {
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    throw new Error("フロントマターが見つかりません。");
  }
  const fm = fmMatch[1];
  const fieldRe = new RegExp(`^(${field}):\\s*.*$`, "m");
  let newFm;
  if (fieldRe.test(fm)) {
    newFm = fm.replace(fieldRe, `${field}: "${value}"`);
  } else {
    // pubDate の直後に updatedDate を入れるのが慣例。なければ末尾追加。
    if (field === "updatedDate" && /^pubDate:/m.test(fm)) {
      newFm = fm.replace(
        /^(pubDate:.*)$/m,
        `$1\n${field}: "${value}"`,
      );
    } else {
      newFm = `${fm}\n${field}: "${value}"`;
    }
  }
  return text.replace(fmMatch[0], `---\n${newFm}\n---`);
}

function main() {
  const field = process.argv[2];
  const explicitId = process.argv[3];

  if (!field || !VALID_FIELDS.has(field)) {
    console.error(
      `エラー: 内部引数 field が不正です (受け取り: ${field})。pubDate または updatedDate を指定してください。`,
    );
    process.exit(1);
  }

  const id = resolveArticleId(explicitId, field);
  const filePath = path.join(blogDir, `${id}.mdx`);

  if (!fs.existsSync(filePath)) {
    console.error(`エラー: 記事ファイルが見つかりません: ${filePath}`);
    process.exit(1);
  }

  const original = fs.readFileSync(filePath, "utf-8");
  const now = formatJstNow();
  const updated = updateFrontmatterField(original, field, now);

  if (updated === original) {
    console.log(`変更なし (${field} は既に同じ値です): ${now}`);
    return;
  }

  fs.writeFileSync(filePath, updated, "utf-8");
  console.log(`✅ ${path.relative(rootDir, filePath).replace(/\\/g, "/")}`);
  console.log(`   ${field}: "${now}"`);
}

try {
  main();
} catch (err) {
  console.error("エラー:", err?.message ?? err);
  process.exit(1);
}
