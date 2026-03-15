#!/usr/bin/env node

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const blogDir = path.join(rootDir, "src", "content", "blog");
const publicFilesDir = path.join(rootDir, "public", "files");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function pad(num) {
  return String(num).padStart(2, "0");
}

function formatJstDate(date = new Date()) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const jst = new Date(utc + 9 * 60 * 60000);

  const year = jst.getFullYear();
  const month = pad(jst.getMonth() + 1);
  const day = pad(jst.getDate());
  const hour = pad(jst.getHours());
  const minute = pad(jst.getMinutes());

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function validateId(id) {
  if (!id) return "ID を入力してください。";
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return "ID は英数字と '-'、'_' のみを含めてください。";
  }
  return null;
}

async function ensureUniqueId(id) {
  const target = path.join(blogDir, `${id}.mdx`);
  const exists = fs.existsSync(target);
  if (exists) {
    return `既に ".mdx" が存在します: ${target}`;
  }
  return null;
}

async function main() {
  try {
    console.log("新しい記事を作成します。");

    let id;
    while (true) {
      const input = (await question("記事のID (例: my-article): ")).trim();
      const validationError = validateId(input);
      if (validationError) {
        console.error(`エラー: ${validationError}`);
        continue;
      }

      const existedError = await ensureUniqueId(input);
      if (existedError) {
        console.error(`エラー: ${existedError}`);
        continue;
      }

      id = input;
      break;
    }

    let title;
    while (true) {
      const input = (await question("ページのタイトル: ")).trim();
      if (!input) {
        console.error("エラー: タイトルを入力してください。");
        continue;
      }
      title = input;
      break;
    }

    const description = (await question("description (任意、Enterでスキップ): ")).trim();

    const nowStr = formatJstDate();

    const outFile = path.join(blogDir, `${id}.mdx`);
    const publicDir = path.join(publicFilesDir, id);

    const content = `---\n` +
      `title: "${title.replace(/"/g, '\\"')}"\n` +
      `description: "${description.replace(/"/g, '\\"')}"\n` +
      `pubDate: "${nowStr}"\n` +
      `updatedDate: null\n` +
      `tags: []\n` +
      `pinned: false\n` +
      `---\n\n`;

    await fs.promises.writeFile(outFile, content, "utf-8");
    await fs.promises.mkdir(publicDir, { recursive: true });

    console.log("");
    console.log("✅ 生成完了");
    console.log(`- 記事ファイル: ${outFile}`);
    console.log(`- 資料フォルダ: ${publicDir}`);
  } catch (error) {
    console.error("エラーが発生しました:", error);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

await main();
