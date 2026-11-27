// Gera dist/worker.js: um Cloudflare Worker que serve os arquivos do app.
// Uso: node scripts/build-worker.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ARQUIVOS = {
  "/index.html": "text/html; charset=utf-8",
  "/manifest.webmanifest": "application/manifest+json",
  "/sw.js": "text/javascript; charset=utf-8",
  "/icons/icon-192.png": "image/png",
  "/icons/icon-512.png": "image/png",
  "/icons/icon-maskable-512.png": "image/png",
  "/icons/apple-touch-icon.png": "image/png"
};

const mapa = {};
for (const [caminho, tipo] of Object.entries(ARQUIVOS)) {
  mapa[caminho] = { tipo, b64: readFileSync("." + caminho).toString("base64") };
}

const codigo = `// Gerado por scripts/build-worker.mjs. Não edite à mão.
const ARQUIVOS = ${JSON.stringify(mapa)};
const decod = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
export default {
  async fetch(request) {
    const url = new URL(request.url);
    let caminho = url.pathname === "/" ? "/index.html" : url.pathname;
    const arq = ARQUIVOS[caminho];
    if (!arq) return new Response("Não encontrado", { status: 404 });
    const semCache = caminho === "/index.html" || caminho === "/sw.js" || caminho === "/manifest.webmanifest";
    return new Response(decod(arq.b64), { headers: {
      "content-type": arq.tipo,
      "cache-control": semCache ? "no-cache" : "public, max-age=604800",
      "x-content-type-options": "nosniff"
    } });
  }
};
`;
mkdirSync("dist", { recursive: true });
writeFileSync("dist/worker.js", codigo);
console.log("dist/worker.js", codigo.length, "bytes");
