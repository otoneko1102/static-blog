import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import satori from "satori";
import sharp from "sharp";
import { SITE_TITLE } from "../../consts";
import fs from "node:fs";
import path from "node:path";

let fontData: ArrayBuffer | null = null;
let thumbnailDataUri: string | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontData) return fontData;
  const res = await fetch(
    "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap",
  );
  const css = await res.text();
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match) throw new Error("Failed to parse Google Fonts CSS");
  const fontUrl = match[1];
  const fontRes = await fetch(fontUrl);
  fontData = await fontRes.arrayBuffer();
  return fontData;
}

function loadThumbnail(): string {
  if (thumbnailDataUri) return thumbnailDataUri;
  const thumbPath = path.resolve("public/thumbnail.png");
  const buf = fs.readFileSync(thumbPath);
  thumbnailDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  return thumbnailDataUri;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection("blog");
  return posts
    .filter((post) => !post.data.hidden)
    .map((post) => ({
      params: { slug: post.id },
      props: { title: post.data.title },
    }));
};

export const GET: APIRoute = async ({ props }) => {
  const { title } = props as { title: string };
  const font = await loadFont();
  const bgImage = loadThumbnail();

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: '"Noto Sans JP"',
          position: "relative",
          overflow: "hidden",
        },
        children: [
          // Background image
          {
            type: "img",
            props: {
              src: bgImage,
              style: {
                position: "absolute",
                top: "0",
                left: "0",
                width: "100%",
                height: "100%",
                objectFit: "cover",
              },
            },
          },
          // Dark overlay for text readability
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: "0",
                left: "0",
                width: "100%",
                height: "100%",
                background: "rgba(0, 0, 0, 0.55)",
              },
            },
          },
          // Title
          // {
          //   type: "div",
          //   props: {
          //     style: {
          //       display: "flex",
          //       justifyContent: "center",
          //       alignItems: "center",
          //       flex: "1",
          //       width: "100%",
          //       padding: "60px 80px",
          //     },
          //     children: {
          //       type: "div",
          //       props: {
          //         style: {
          //           fontSize: title.length > 30 ? "48px" : title.length > 20 ? "56px" : "64px",
          //           fontWeight: "700",
          //           color: "#ffffff",
          //           lineHeight: "1.4",
          //           textAlign: "center",
          //           wordBreak: "break-word",
          //           maxWidth: "100%",
          //           textShadow: "0 2px 8px rgba(0,0,0,0.6)",
          //         },
          //         children: title,
          //       },
          //     },
          //   },
          // },
          // Site name at bottom
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                paddingBottom: "40px",
              },
              children: {
                type: "div",
                props: {
                  style: {
                    fontSize: "28px",
                    fontWeight: "700",
                    color: "#a78bfa",
                    textShadow: "0 2px 6px rgba(0,0,0,0.5)",
                  },
                  children: SITE_TITLE,
                },
              },
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Noto Sans JP",
          data: font,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(png as any, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
