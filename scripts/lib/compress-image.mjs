import sharp from "sharp";

// 画像圧縮の共通ロジック。
// `pnpm file` のアップロード (compress-image → compressUpload) と
// `pnpm comp` / `pnpm comp:all` (recompress) で共有する。
//
// 方針: 画質をあまり落とさず (準ロスレス) にサイズを削減する。
//  - アップロード (compressUpload): 静止画はすべて PNG に変換する。新規
//    ファイルなので拡張子が変わっても記事参照に影響しない。アニメ
//    (GIF / APNG / animated WebP) だけは再エンコードせず元形式を保持する。
//  - 再圧縮 (recompress): 拡張子を変えると記事内の ![](...) 参照が壊れるため、
//    PNG / JPEG のみを対象に同じ拡張子で書き戻す。
//
// 形式別エンコーダ:
//  - PNG  : パレット量子化 (高品質) + 最大圧縮。アニメ PNG はロスレス。
//  - JPEG : mozjpeg エンコーダで品質 88 に再エンコード (recompress のみ)。

export const JPEG_EXTS = [".jpg", ".jpeg", ".jpe", ".jfif"];

// sharp の format 名 → 拡張子 (アニメ画像の出力拡張子決定に使用)
export const SHARP_FORMAT_TO_EXT = {
  png: ".png",
  jpeg: ".jpg",
  webp: ".webp",
  gif: ".gif",
  avif: ".avif",
  tiff: ".tif",
  svg: ".svg",
  heif: ".heic",
};

async function readMeta(buffer) {
  try {
    return await sharp(buffer, { animated: true }).metadata();
  } catch {
    return null;
  }
}

// ---- 形式別エンコーダ (準ロスレス) ----

function encodePngQuantized(buffer) {
  // libimagequant でパレット量子化。screenshots / 図はほぼ劣化なくサイズ減。
  return sharp(buffer)
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      quality: 90,
      effort: 10,
    })
    .toBuffer();
}

function encodePngLossless(buffer) {
  // アニメ PNG (APNG) を破壊しないようロスレスのみ。
  return sharp(buffer, { animated: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function encodeJpeg(buffer) {
  return sharp(buffer).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/**
 * 既存ファイルの再圧縮 (拡張子は保持)。
 * PNG / JPEG のみ対象。圧縮できない / サイズが縮まない場合は null。
 * @returns {Promise<Buffer|null>}
 */
export async function recompress(buffer, ext) {
  const e = ext.toLowerCase();
  let out = null;
  try {
    if (e === ".png" || e === ".apng") {
      const meta = await readMeta(buffer);
      out =
        meta && (meta.pages ?? 1) > 1
          ? await encodePngLossless(buffer)
          : await encodePngQuantized(buffer);
    } else if (JPEG_EXTS.includes(e)) {
      out = await encodeJpeg(buffer);
    } else {
      return null;
    }
  } catch {
    return null;
  }
  if (!out || out.length >= buffer.length) return null;
  return out;
}

/**
 * アップロード時の圧縮。静止画はすべて PNG (パレット量子化) に変換する。
 * 新規ファイルなので拡張子が変わっても記事参照に影響しない。
 * アニメ (GIF / APNG / animated WebP) だけは再エンコードせず元形式を保持する。
 * SVG / HEIC は呼び出し側で処理。
 * @returns {Promise<{buffer: Buffer, ext: string}>}
 */
export async function compressUpload(buffer, ext) {
  const e = ext.toLowerCase();
  const meta = await readMeta(buffer);
  const animated = meta ? (meta.pages ?? 1) > 1 : false;

  // アニメ (GIF / APNG / animated WebP) は再エンコードせず元バイト・形式を保持
  if (animated) {
    const outExt = SHARP_FORMAT_TO_EXT[meta.format] || e || ".gif";
    return { buffer, ext: outExt };
  }

  // 静止画はすべて PNG 量子化に変換する
  try {
    return { buffer: await encodePngQuantized(buffer), ext: ".png" };
  } catch {
    // 変換に失敗した場合は元のまま保存
    return { buffer, ext: e };
  }
}
