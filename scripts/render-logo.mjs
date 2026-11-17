// Renders public/brand/*.svg to PNG for email clients (Gmail/Outlook don't render SVG). Pure WASM, no native binaries.
import { readFileSync, writeFileSync } from "node:fs";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
await initWasm(readFileSync("node_modules/@resvg/resvg-wasm/index_bg.wasm"));
for (const [src, out, width] of [
  ["public/brand/imagine-logo.svg", "public/brand/imagine-logo.png", 448],
  ["public/brand/imagine-mark.svg", "public/brand/imagine-mark.png", 192],
]) {
  const r = new Resvg(readFileSync(src, "utf8"), { fitTo: { mode: "width", value: width }, background: "rgba(0,0,0,0)" });
  const png = r.render().asPng();
  writeFileSync(out, png);
  console.log(out, png.length, "bytes", r.width, "x", r.height);
}
