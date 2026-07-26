import sharp from "sharp";
import path from "node:path";

const srcPath = path.resolve("docs/brand/arcos-logo.jpeg");
const outPath = path.resolve("apps/web/public/logo.png");

const image = sharp(srcPath).ensureAlpha();
const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const threshold = 30; // near-black pixels become transparent

for (let i = 0; i < data.length; i += channels) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r <= threshold && g <= threshold && b <= threshold) {
    data[i + 3] = 0; // alpha
  }
}

await sharp(data, { raw: { width, height, channels } }).png().toFile(outPath);
console.log(`Wrote transparent logo to ${outPath}`);
