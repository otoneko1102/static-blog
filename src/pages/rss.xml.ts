import type { APIRoute } from "astro";
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { SITE_TITLE, SITE_DESCRIPTION, SITE_URL, sortPosts } from "../consts";

export const GET: APIRoute = async (context) => {
  const posts = (await getCollection("blog"))
    .filter((p) => !p.data.hidden)
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site || SITE_URL,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.id}`,
    })),
  });
};
