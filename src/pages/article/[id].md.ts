import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import fs from "fs";
import path from "path";

export async function getStaticPaths() {
  const posts = await getCollection("blog");
  return posts.map((post) => ({
    params: { id: post.id },
  }));
}

export const GET: APIRoute = async ({ params }) => {
  const id = params.id as string;
  const contentDir = path.resolve(process.cwd(), "src/content/blog");

  for (const ext of [".md", ".mdx"]) {
    const filePath = path.join(contentDir, `${id}${ext}`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return new Response(content, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }

  return new Response("Not Found", { status: 404 });
};
