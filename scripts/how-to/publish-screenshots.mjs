/** Run with: node --import tsx scripts/how-to/publish-screenshots.mjs [capture-directory] */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { GUIDE_CHAPTERS } from "../../src/lib/how-to/content.ts";

const input = path.resolve(process.argv[2] || "output/playwright/how-to");
const output = path.resolve("public/how-to/screenshots");
await mkdir(output, { recursive: true });
const ids = [
  ...new Set(
    GUIDE_CHAPTERS.flatMap((chapter) =>
      chapter.steps.map((step) => step.image),
    ),
  ),
].sort();
const manifest = {};
for (const id of ids) {
  const snapshot = await readFile(path.join(input, `${id}.txt`), "utf8");
  if (
    /404 Not Found|Page URL:.*reason=expired|Internal Server Error/.test(
      snapshot,
    )
  )
    throw new Error(`Invalid capture: ${id}`);
  const sourceUrl = snapshot.match(/Page URL: (.+)/)?.[1];
  if (!sourceUrl || new URL(sourceUrl).hostname !== "127.0.0.1")
    throw new Error(`Expected local sample capture: ${id}`);
  const destination = path.join(output, `${id}.webp`);
  await sharp(path.join(input, `${id}.png`))
    .resize({ width: 1440, withoutEnlargement: true })
    .webp({ quality: 84, effort: 5 })
    .toFile(destination);
  const { width, height } = await sharp(destination).metadata();
  const bytes = await readFile(destination);
  manifest[id] = {
    width,
    height,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    route: new URL(sourceUrl).pathname,
    environment: ["payment-item", "payment-items"].includes(id)
      ? "local emulator; illustrative Stripe status fixture"
      : "local emulator or public local app; sample data",
  };
}
await writeFile(
  "src/lib/how-to/screenshots.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Published ${ids.length} WebP screenshots (${(Object.values(manifest).reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(1)} MiB).`,
);
