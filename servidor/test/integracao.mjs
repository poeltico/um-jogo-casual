// Teste de ponta a ponta contra um servidor rodando (wrangler dev ou o publicado).
// Uso: node test/integracao.mjs [http://localhost:8787]
import assert from "node:assert/strict";
const BASE = process.argv[2] || "http://localhost:8787";
const ORIGEM = "http://localhost:5173";
const WS = BASE.replace(/^http/, "ws");

function celular(nome) {
  const token = crypto.randomUUID();
  const c = { nome, token, msgs: [], estado: null, ws: null };
  c.conectar = codigo => new Promise((ok, erro) => {
    c.ws = new WebSocket(`${WS}/sala/${codigo}/ws`, { headers: { Origin: ORIGEM } });
    c.ws.onmessage = e => { const m = JSON.parse(e.data); c.msgs.push(m); if (m.t === "estado") c.estado = m; };
    c.ws.onopen = () => { c.enviar({ t: "entrar", token: c.token, nome }); ok(); };
    c.ws.onerror = erro;
  });
  c.enviar = m => c.ws.send(JSON.stringify(m));
  c.espera = async (cond, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (cond(c)) return; await new Promise(r => setTimeout(r, 30)); }
    throw new Error(nome + ": esperou demais. Última: " + JSON.stringify(c.msgs.at(-1)).slice(0, 300));
  };
  return c;
}

const ana = celular("Ana"), beto = celular("Beto"), cris = celular("Cris");
const r = await fetch(BASE + "/sala/nova", { method: "POST", headers: { Origin: ORIGEM, "Content-Type": "application/json" }, body: JSON.stringify({ token: ana.token, nome: "Ana", nivel: "facil" }) });
assert.equal(r.status, 200);
const { codigo } = await r.json();
console.log("sala", codigo);
await ana.conectar(codigo);
await beto.conectar(codigo);
await cris.conectar(codigo);
await ana.espera(c => c.estado?.sala.jogadores.length === 3);
const id = n => ana.estado.sala.jogadores.find(p => p.nome === n).id;
const [A, B, C] = ["Ana", "Beto", "Cris"].map(id);

// Nome repetido é recusado
const dup = celular("ana"); await dup.conectar(codigo);
await dup.espera(c => c.msgs.some(m => m.t === "erro"));
dup.ws.close();

ana.enviar({ t: "organizar" });
await cris.espera(c => c.estado.sala.fase === "ordem");
// Ana -> Beto -> Cris -> Ana, mas Cris erra primeiro escolhendo Beto
ana.enviar({ t: "esquerda", pid: B });
beto.enviar({ t: "esquerda", pid: C });
cris.enviar({ t: "esquerda", pid: B });
await ana.espera(c => c.estado.sala.rodaStatus && !c.estado.sala.rodaStatus.ok && c.estado.sala.rodaStatus.conflitos.length === 2);
ana.enviar({ t: "comecar", primeiro: B });
await ana.espera(c => c.msgs.at(-1).t === "erro");
cris.enviar({ t: "esquerda", pid: A });
await ana.espera(c => c.estado.sala.rodaStatus?.ok);
beto.enviar({ t: "comecar", primeiro: B });
await beto.espera(c => c.msgs.at(-1).t === "erro" && /criou/.test(c.msgs.at(-1).msg));
ana.enviar({ t: "comecar", primeiro: B });
await cris.espera(c => c.estado.sala.fase === "jogo");
assert.deepEqual(cris.estado.sala.roda, [B, C, A]);
const j = cris.estado.sala.jogo;
assert.equal(j.daVez, B);
assert.ok(j.maos[C].every(x => x.c === undefined), "Cris não vê as próprias cartas");
assert.ok(j.maos[A].every(x => x.c), "Cris vê as cartas da Ana");

// Beto dá dica para Cris
const cartaCris = beto.estado.sala.jogo.maos[C][0];
beto.enviar({ t: "jogada", acao: { tipo: "dica", alvo: C, numero: cartaCris.n } });
await cris.espera(c => c.estado.sala.jogo.daVez === C);
assert.equal(cris.estado.sala.jogo.lunetas, 7);
assert.ok(cris.estado.sala.jogo.maos[C][0].marcas.some(m => m.sim && m.numero === cartaCris.n));

// Pizza chegou: Ana cai, a partida pausa
ana.ws.close();
await cris.espera(c => c.estado.sala.pausa?.faltam.includes(A));
cris.enviar({ t: "jogada", acao: { tipo: "dica", alvo: B, numero: beto.estado.sala.jogo ? cris.estado.sala.jogo.maos[B][0].n : 1 } });
await cris.espera(c => c.msgs.at(-1).t === "erro" && /pausada/.test(c.msgs.at(-1).msg));
// Anotar ainda vale durante a pausa
cris.enviar({ t: "jogada", acao: { tipo: "anotar", carta: cris.estado.sala.jogo.maos[C][1].id, c: "leao" } });
await cris.espera(c => c.estado.sala.jogo.maos[C][1].nota?.c === "leao");
// Ana volta com a mesma chave
await ana.conectar(codigo);
await cris.espera(c => c.estado.sala.pausa === null);
assert.equal(ana.estado.sala.jogo.daVez, C);

// Pausa manual
beto.enviar({ t: "pausar", on: true });
await ana.espera(c => c.estado.sala.pausa?.manual === "Beto");
beto.enviar({ t: "pausar", on: false });
await ana.espera(c => c.estado.sala.pausa === null);

// Cris acende uma carta
cris.enviar({ t: "jogada", acao: { tipo: "acender", carta: cris.estado.sala.jogo.maos[C][0].id } });
await ana.espera(c => c.estado.sala.jogo.daVez === A);
console.log("última jogada:", JSON.stringify(ana.estado.sala.jogo.ultima));

// Celular novo pede o lugar do Beto
beto.ws.close();
const beto2 = celular("Beto"); await beto2.conectar(codigo);
await beto2.espera(c => c.msgs.some(m => m.t === "escolherLugar"));
beto2.enviar({ t: "pedirLugar", lugar: B, token: beto2.token });
await ana.espera(c => c.estado.sala.pedidos.length === 1);
ana.enviar({ t: "devolver", pedido: ana.estado.sala.pedidos[0].id, sim: true });
await beto2.espera(c => c.estado?.voce === B);
await ana.espera(c => c.estado.sala.pausa === null);

// Recomeçar
ana.enviar({ t: "recomecar" });
await beto2.espera(c => c.estado.sala.jogo.lunetas === 8 && c.estado.sala.jogo.turno === 1);
console.log("OK: tudo certo de ponta a ponta");
for (const c of [ana, beto2, cris]) c.ws.close();
process.exit(0);
