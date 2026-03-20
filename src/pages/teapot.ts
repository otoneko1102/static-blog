import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const body = "418 I'm a teapot\n";
  return new Response(body, {
    status: 418,
    statusText: "I'm a teapot",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
