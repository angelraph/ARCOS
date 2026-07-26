import sharp from "sharp";

const srcPath = "apps/web/public/logo.png";
const outPath = "apps/web/public/logo-mark.png";

const image = sharp(srcPath).ensureAlpha();
const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

// Wipe only the tagline text (x >= 500, y >= 440) — the icon's swoosh extends past y=440
// but stays under x=500, so this leaves the icon and "ARCOS" wordmark fully intact.
for (let y = 436; y < height; y++) {
  for (let x = 500; x < width; x++) {
    const i = (y * width + x) * channels;
    data[i + 3] = 0;
  }
}

const cropped = await sharp(data, { raw: { width, height, channels } })
  .png()
  .trim()
  .toBuffer();

await sharp(cropped).toFile(outPath);
const meta = await sharp(outPath).metadata();
console.log(`Wrote ${outPath} (${meta.width}x${meta.height})`);
