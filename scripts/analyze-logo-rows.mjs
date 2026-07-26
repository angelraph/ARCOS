import sharp from "sharp";

const image = sharp("apps/web/public/logo.png").ensureAlpha();
const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

const xStart = 500; // restrict to the wordmark/tagline text area, excluding the icon glyph

const rowHasContent = [];
for (let y = 0; y < height; y++) {
  let hasContent = false;
  for (let x = xStart; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] > 10) {
      hasContent = true;
      break;
    }
  }
  rowHasContent.push(hasContent);
}

let bands = [];
let start = null;
for (let y = 0; y < height; y++) {
  if (rowHasContent[y] && start === null) start = y;
  if (!rowHasContent[y] && start !== null) {
    bands.push([start, y - 1]);
    start = null;
  }
}
if (start !== null) bands.push([start, height - 1]);

console.log("content bands in text area (top, bottom):", bands);
