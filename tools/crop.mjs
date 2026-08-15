import sharp from "sharp";

/** node tools/crop.mjs <in> <out> <left> <top> <w> <h> [scale] */
const [input, output, left, top, width, height, scale = "3"] = process.argv.slice(2);

await sharp(input)
  .extract({
    left: Number(left),
    top: Number(top),
    width: Number(width),
    height: Number(height),
  })
  .resize(Number(width) * Number(scale), Number(height) * Number(scale), { kernel: "nearest" })
  .png()
  .toFile(output);

process.stdout.write(`${output}\n`);
