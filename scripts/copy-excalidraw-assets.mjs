// Copies Excalidraw's font files into public/ so the whiteboard is self-hosted
// (no third-party CDN, works offline / on a school LAN). Runs on `npm install`.
import { cpSync, existsSync } from "node:fs";

const src = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
const dest = "public/excalidraw-assets/fonts";
if (existsSync(src)) {
  cpSync(src, dest, { recursive: true });
  console.log("Copied Excalidraw fonts to", dest);
}
