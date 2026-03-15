import fs from 'fs';
import path from 'path';

const blogDir = 'src/content/blog';
const files = fs.readdirSync(blogDir).filter((f) => f.endsWith('.mdx')).map((f) => path.join(blogDir, f));
const pad = (n) => String(n).padStart(2, '0');

const toJst = (d) => {
  const dt = new Date(d);
  return new Date(dt.getTime() + 9 * 60 * 60 * 1000);
};

const fmt = (d) => {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  if (hh === '00' && mm === '00') return `${y}-${m}-${dd}`;
  return `${y}-${m}-${dd} ${hh}:${mm}`;
};

let changed = 0;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const updated = text.replace(/^\s*(pubDate|updatedDate):\s*"([^"]+)"/gm, (m, key, val) => {
    const date = new Date(val);
    if (isNaN(date)) return m;
    const jst = toJst(date);
    return `${key}: "${fmt(jst)}"`;
  });

  if (updated !== text) {
    fs.writeFileSync(file, updated, 'utf8');
    console.log('updated', file);
    changed++;
  }
}

console.log('done', changed, 'files updated');
