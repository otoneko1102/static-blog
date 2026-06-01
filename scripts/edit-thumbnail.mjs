#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pug from "pug";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const blogDir = path.join(rootDir, "src", "content", "blog");
const publicFilesDir = path.join(rootDir, "public", "files");
const editorDir = path.join(__dirname, "edit-thumbnail");
const assetsDir = path.join(editorDir, "assets");
const layoutPath = path.join(editorDir, "layout.pug");
const cropperCssPath = path.join(
  rootDir,
  "node_modules",
  "cropperjs",
  "dist",
  "cropper.min.css",
);
const cropperJsPath = path.join(
  rootDir,
  "node_modules",
  "cropperjs",
  "dist",
  "cropper.min.js",
);

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 630;
const VALID_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".apng"];
// 出力サイズ 1200×630 を連結。Astro (4321) など主要 dev サーバとも非衝突。
const EDITOR_PORT = 12630;

const compileLayout = pug.compileFile(layoutPath, {
  basedir: editorDir,
  pretty: false,
});

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
        "  使い方: pnpm thumbnail <id>  または  article/<id> ブランチに切り替えてください。",
    );
  }
  return branchId;
}

function findExistingThumbnail(articleDir) {
  for (const ext of VALID_EXTS) {
    const p = path.join(articleDir, `_thumbnail${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function extToMime(ext) {
  return (
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".avif": "image/avif",
      ".gif": "image/gif",
      ".apng": "image/apng",
    }[ext.toLowerCase()] || "application/octet-stream"
  );
}

function mimeToExt(mime) {
  return (
    {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/avif": ".avif",
    }[mime] || ".png"
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
  });
  res.end(data);
}

function sendFile(res, filePath, mime) {
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": stat.size,
  });
  fs.createReadStream(filePath).pipe(res);
}

function dataUrlToBuffer(dataUrl) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("不正な dataURL です");
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

function isHeic(buffer) {
  if (buffer.length < 12) return false;
  if (buffer.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  const brand = buffer.subarray(8, 12).toString("ascii");
  return [
    "heic",
    "heix",
    "hevc",
    "hevx",
    "mif1",
    "msf1",
    "heim",
    "heis",
  ].includes(brand);
}

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        shell: false,
      }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    /* user can open manually */
  }
}

function removeOtherThumbnails(articleDir, keepExt) {
  for (const ext of VALID_EXTS) {
    if (ext === keepExt) continue;
    const p = path.join(articleDir, `_thumbnail${ext}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

const STATIC_ROUTES = {
  "/cropper.css": [cropperCssPath, "text/css; charset=utf-8"],
  "/cropper.js": [cropperJsPath, "application/javascript; charset=utf-8"],
  "/editor.css": [
    path.join(assetsDir, "editor.css"),
    "text/css; charset=utf-8",
  ],
  "/editor.js": [
    path.join(assetsDir, "editor.js"),
    "application/javascript; charset=utf-8",
  ],
};

async function main() {
  const id = resolveArticleId(process.argv);

  const mdxPath = path.join(blogDir, `${id}.mdx`);
  const mdPath = path.join(blogDir, `${id}.md`);
  if (!fs.existsSync(mdxPath) && !fs.existsSync(mdPath)) {
    console.error(`エラー: 記事が見つかりません: ${mdxPath}`);
    process.exit(1);
  }

  const articleDir = path.join(publicFilesDir, id);
  fs.mkdirSync(articleDir, { recursive: true });

  console.log(`[記事ID]   ${id}`);
  console.log(
    `[保存先]   ${path.relative(rootDir, articleDir).replace(/\\/g, "/")}/_thumbnail.png`,
  );
  console.log(`[出力サイズ] ${TARGET_WIDTH} x ${TARGET_HEIGHT} px (PNG)`);

  let sseClients = 0;
  let shutdownTimer = null;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (req.method === "GET" && url.pathname === "/") {
        const found = findExistingThumbnail(articleDir);
        let hasSource = false;
        let initialDataUrl = "";
        let initialFilename = "";
        if (found) {
          const buf = fs.readFileSync(found);
          const ext = path.extname(found);
          hasSource = true;
          initialDataUrl = `data:${extToMime(ext)};base64,${buf.toString("base64")}`;
          initialFilename = path.basename(found);
        }
        const configJson = JSON.stringify({
          targetWidth: TARGET_WIDTH,
          targetHeight: TARGET_HEIGHT,
          hasSource,
          initialFilename,
        }).replace(/</g, "\\u003c");
        const html = compileLayout({
          articleId: id,
          targetWidth: TARGET_WIDTH,
          targetHeight: TARGET_HEIGHT,
          hasSource,
          initialDataUrl,
          initialFilename,
          configJson,
        });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "GET" && STATIC_ROUTES[url.pathname]) {
        const [filePath, mime] = STATIC_ROUTES[url.pathname];
        sendFile(res, filePath, mime);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/source") {
        const found = findExistingThumbnail(articleDir);
        if (!found) {
          sendJson(res, 200, { hasSource: false });
          return;
        }
        const buf = fs.readFileSync(found);
        const ext = path.extname(found);
        const dataUrl = `data:${extToMime(ext)};base64,${buf.toString("base64")}`;
        sendJson(res, 200, {
          hasSource: true,
          dataUrl,
          filename: path.basename(found),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/upload") {
        const body = await readBody(req);
        const { dataUrl, ext } = JSON.parse(body.toString("utf-8"));
        const { buffer, mime } = dataUrlToBuffer(dataUrl);
        const requested = (ext || "").toLowerCase();

        // HEIC/HEIF はブラウザでレンダリングできないので PNG に変換
        const isHeicInput =
          requested === ".heic" ||
          requested === ".heif" ||
          mime === "image/heic" ||
          mime === "image/heif" ||
          isHeic(buffer);

        let outBuffer = buffer;
        let outExt = VALID_EXTS.includes(requested)
          ? requested
          : mimeToExt(mime);
        let convertedDataUrl = null;

        if (isHeicInput) {
          const heicConvert = (await import("heic-convert")).default;
          const png = await heicConvert({ buffer, format: "PNG" });
          outBuffer = Buffer.from(png);
          outExt = ".png";
          convertedDataUrl = `data:image/png;base64,${outBuffer.toString("base64")}`;
        } else {
          // 静止画はすべて PNG に変換する。アニメ (GIF/APNG/animated WebP)
          // だけは元形式を保持する。クライアントの拡張子ヒントは信頼せず、
          // 実際のバイト列から形式・アニメ有無を判定する。
          const meta = await sharp(buffer, { animated: true })
            .metadata()
            .catch(() => null);
          const animated = meta ? (meta.pages ?? 1) > 1 : false;
          if (animated) {
            // sharp の format 名 → 拡張子 (APNG は format=png として報告される)
            outExt =
              { gif: ".gif", webp: ".webp", png: ".apng" }[meta.format] ||
              (VALID_EXTS.includes(requested) ? requested : ".gif");
          } else {
            outBuffer = await sharp(buffer)
              .png({ compressionLevel: 9, adaptiveFiltering: true })
              .toBuffer();
            outExt = ".png";
            convertedDataUrl = `data:image/png;base64,${outBuffer.toString("base64")}`;
          }
        }

        removeOtherThumbnails(articleDir, outExt);
        fs.writeFileSync(
          path.join(articleDir, `_thumbnail${outExt}`),
          outBuffer,
        );
        console.log(
          `[upload] _thumbnail${outExt} (${outBuffer.length} bytes${convertedDataUrl ? ", PNG に変換" : ""})`,
        );
        sendJson(res, 200, {
          ok: true,
          ext: outExt,
          dataUrl: convertedDataUrl,
          converted: convertedDataUrl !== null,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/save") {
        const body = await readBody(req);
        const { dataUrl } = JSON.parse(body.toString("utf-8"));
        const { buffer } = dataUrlToBuffer(dataUrl);
        const meta = await sharp(buffer).metadata();
        if (meta.width !== TARGET_WIDTH || meta.height !== TARGET_HEIGHT) {
          throw new Error(
            `サイズが ${TARGET_WIDTH}x${TARGET_HEIGHT} ではありません: ${meta.width}x${meta.height}`,
          );
        }
        const png = await sharp(buffer).png().toBuffer();
        removeOtherThumbnails(articleDir, ".png");
        const outPath = path.join(articleDir, "_thumbnail.png");
        fs.writeFileSync(outPath, png);
        console.log(
          `[save]   ${path.relative(rootDir, outPath).replace(/\\/g, "/")} (${png.length} bytes)`,
        );
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/events") {
        sseClients++;
        if (shutdownTimer) {
          clearTimeout(shutdownTimer);
          shutdownTimer = null;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(": connected\n\n");
        req.on("close", () => {
          sseClients--;
          if (sseClients === 0) {
            shutdownTimer = setTimeout(() => {
              if (sseClients === 0) {
                console.log("\nタブが閉じられました。エディタを終了します。");
                server.close(() => process.exit(0));
                setTimeout(() => process.exit(0), 500).unref();
              }
            }, 2000);
          }
        });
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } catch (err) {
      console.error("リクエストエラー:", err);
      sendJson(res, 500, { error: String(err?.message ?? err) });
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\nエラー: ポート ${EDITOR_PORT} は既に使用されています。\n` +
          `  ・別の \`pnpm thumbnail\` プロセスが起動中の可能性があります。\n` +
          `  ・他のアプリで同じポートを使用している場合は、解放してから再実行してください。`,
      );
    } else {
      console.error("サーバエラー:", err);
    }
    process.exit(1);
  });

  server.listen(EDITOR_PORT, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${EDITOR_PORT}/`;
    console.log("");
    console.log(`エディタを起動しました: ${url}`);
    console.log("ブラウザが開かない場合は上記URLを開いてください。");
    console.log("Ctrl+C で終了します。");
    console.log("");
    openBrowser(url);
  });

  const shutdown = () => {
    console.log("\nエディタを終了します");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("エラー:", err?.message ?? err);
  process.exit(1);
});
