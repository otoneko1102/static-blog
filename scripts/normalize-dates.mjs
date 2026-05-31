import fs from "fs";
import path from "path";
import { jst } from "./lib/jst.mjs";

const blogDir = "src/content/blog";
const files = fs
  .readdirSync(blogDir)
  .filter((f) => f.endsWith(".mdx"))
  .map((f) => path.join(blogDir, f));

const fmt = (d) => {
  if (d.hour() === 0 && d.minute() === 0) return d.format("YYYY-MM-DD");
  return d.format("YYYY-MM-DD HH:mm");
};

let changed = 0;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const updated = text.replace(
    /^\s*(pubDate|updatedDate):\s*"([^"]+)"/gm,
    (m, key, val) => {
      const d = jst(val);
      if (!d.isValid()) return m;
      return `${key}: "${fmt(d)}"`;
    },
  );

  if (updated !== text) {
    fs.writeFileSync(file, updated, "utf8");
    console.log("updated", file);
    changed++;
  }
}

console.log("done", changed, "files updated");
