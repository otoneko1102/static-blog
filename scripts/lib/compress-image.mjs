import sharp from "sharp";

// 画像圧縮の共通ロジック。
// `pnpm file` のアップロード (compress-image → compressUpload) と
// `pnpm comp` / `pnpm comp:all` (recompress) で共有する。
//
// 方針: 画質をあまり落とさず (準ロスレス) にサイズを削減し、拡張子は保持する。
//  - PNG  : パレット量子化 (高品質) + 最大圧縮。アニメ PNG はロスレス。
//  - JPEG : mozjpeg エンコーダで品質 88 に再エンコード。
//  - WebP : 品質 90 で再エンコード (アップロード時のみ)。
// 拡張子を変えると記事内の ![](...) 参照が壊れるため、既存ファイルの
// 再圧縮 (recompress) では PNG / JPEG のみを対象に同じ拡張子で書き戻す。

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

function encodeWebp(buffer) {
  return sharp(buffer).webp({ quality: 90, effort: 6 }).toBuffer();
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

function pickSmaller(candidate, candidateExt, original, originalExt) {
  if (candidate && candidate.length < original.length) {
    return { buffer: candidate, ext: candidateExt };
  }
  return { buffer: original, ext: originalExt };
}

/**
 * アップロード時の圧縮。形式を保持しつつ準ロスレス圧縮する。
 * 非 Web 形式 (BMP/TIFF) や静止 GIF は PNG に変換する (新規ファイルなので
 * 拡張子が変わっても記事参照に影響しない)。SVG / HEIC は呼び出し側で処理。
 * @returns {Promise<{buffer: Buffer, ext: string}>}
 */
export async function compressUpload(buffer, ext) {
  const e = ext.toLowerCase();
  const meta = await readMeta(buffer);
  const animated = meta ? (meta.pages ?? 1) > 1 : false;

  // アニメ (GIF / APNG / animated WebP) は再エンコードせず元バイトを保持
  if (animated) {
    const outExt = SHARP_FORMAT_TO_EXT[meta.format] || e || ".gif";
    return { buffer, ext: outExt };
  }

  try {
    if (JPEG_EXTS.includes(e)) {
      // .jpeg / .jpe / .jfif も元の拡張子のまま保持する
      return pickSmaller(await encodeJpeg(buffer), e, buffer, e);
    }
    if (e === ".png") {
      return pickSmaller(await encodePngQuantized(buffer), ".png", buffer, e);
    }
    if (e === ".webp") {
      return pickSmaller(await encodeWebp(buffer), ".webp", buffer, e);
    }
    if (e === ".avif") {
      // すでに高効率なのでそのまま
      return { buffer, ext: e };
    }
    // BMP / TIFF / 静止 GIF / その他 sharp が読める形式 → PNG 量子化
    return { buffer: await encodePngQuantized(buffer), ext: ".png" };
  } catch {
    // 圧縮に失敗した場合は元のまま保存
    return { buffer, ext: e };
  }
}
