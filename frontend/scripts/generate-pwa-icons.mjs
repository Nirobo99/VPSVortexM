import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const faviconPath = join(__dirname, "../public/favicon.jpg");
const svgPath = join(__dirname, "../public/icons/icon.svg");
const outDir = join(__dirname, "../public/icons");

async function main() {
  const sharp = (await import("sharp")).default;
  const source = existsSync(faviconPath) ? faviconPath : svgPath;
  const input = sharp(source);

  for (const size of [192, 512]) {
    const out = join(outDir, `icon-${size}.png`);
    await input.clone().resize(size, size, { fit: "cover" }).png().toFile(out);
    console.log(`Generated ${out}`);
  }

  const apple = join(outDir, "apple-touch-icon.png");
  await input.clone().resize(180, 180, { fit: "cover" }).png().toFile(apple);
  console.log(`Generated ${apple}`);
}

main().catch((err) => {
  if (!existsSync(join(__dirname, "../node_modules/sharp"))) {
    console.warn("sharp not installed — run npm install");
  }
  console.error(err);
  process.exit(1);
});
