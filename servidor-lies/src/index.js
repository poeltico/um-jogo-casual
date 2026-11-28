// Worker das salas do Lies.
// POST /sala/nova cria uma sala e devolve o código; /sala/CODIGO/ws é a conexão ao vivo.
export { Sala } from "./sala.js";

const LETRAS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // sem I, L e O, que confundem

function origemOk(origem) {
  if (!origem) return false;
  try {
    const u = new URL(origem);
    return u.hostname === "um-jogo-casual.pages.dev" || u.hostname.endsWith(".um-jogo-casual.pages.dev") ||
      u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function cors(origem) {
  return {
    "Access-Control-Allow-Origin": origem,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function novoCodigo() {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return [...b].map(x => LETRAS[x % LETRAS.length]).join("");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origem = req.headers.get("Origin");
    if (url.pathname === "/") return new Response("Salas do Lies no ar.");
    if (!origemOk(origem)) return new Response("origem não permitida", { status: 403 });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(origem) });

    if (url.pathname === "/sala/nova" && req.method === "POST") {
      const dados = await req.json().catch(() => ({}));
      for (let i = 0; i < 8; i++) {
        const codigo = novoCodigo();
        const sala = env.SALAS.get(env.SALAS.idFromName(codigo));
        const r = await sala.fetch("https://sala/criar", { method: "POST", body: JSON.stringify({ ...dados, codigo }) });
        if (r.status === 409) continue;
        return new Response(r.body, { status: r.status, headers: { ...cors(origem), "Content-Type": "application/json" } });
      }
      return new Response("sem código livre", { status: 503, headers: cors(origem) });
    }

    const m = url.pathname.match(/^\/sala\/([A-Z]{4})\/ws$/);
    if (m && req.headers.get("Upgrade") === "websocket") {
      const sala = env.SALAS.get(env.SALAS.idFromName(m[1]));
      return sala.fetch(req);
    }
    return new Response("não encontrado", { status: 404 });
  }
};
