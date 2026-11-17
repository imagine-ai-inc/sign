import { copyFileSync, existsSync } from "node:fs";
const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
if (existsSync(src)) { copyFileSync(src, "public/pdf.worker.min.mjs"); console.log("copied pdf.js worker"); }
