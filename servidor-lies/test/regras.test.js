import { test } from "node:test";
import assert from "node:assert/strict";
import { novoJogo, agir, visaoDe, ESPIOES, TAMANHOS, liderAtual, ErroJogo } from "../src/regras.js";

const ids = n => Array.from({ length: n }, (_, i) => "p" + i);
const res = j => j.ordem.filter(p => !j.espioes.includes(p));

function aprovarEquipe(j, equipe, sim = true) {
  for (const p of equipe) agir(j, liderAtual(j), { tipo: "marcar", alvo: p });
  agir(j, liderAtual(j), { tipo: "propor" });
  for (const p of j.ordem) agir(j, p, { tipo: "votar", sim });
}

test("sorteia o número certo de espiões", () => {
  for (let n = 5; n <= 10; n++) {
    const j = novoJogo(ids(n));
    assert.equal(j.espioes.length, ESPIOES[n]);
    assert.equal(new Set(j.espioes).size, ESPIOES[n]);
  }
  assert.throws(() => novoJogo(ids(4)), ErroJogo);
  assert.throws(() => novoJogo(ids(11)), ErroJogo);
});

test("espião vê os parceiros; resistência não vê ninguém", () => {
  const j = novoJogo(ids(7));
  const e = j.espioes[0], r = res(j)[0];
  assert.deepEqual(visaoDe(j, e).eu.parceiros.sort(), j.espioes.filter(x => x !== e).sort());
  assert.deepEqual(visaoDe(j, r).eu, { espiao: false, parceiros: [] });
  assert.equal(visaoDe(j, r).espioes, null);
});

test("só o líder monta e o tamanho é respeitado", () => {
  const j = novoJogo(ids(5));
  const outro = j.ordem[1];
  assert.throws(() => agir(j, outro, { tipo: "marcar", alvo: outro }), /líder/);
  agir(j, j.ordem[0], { tipo: "marcar", alvo: "p1" });
  agir(j, j.ordem[0], { tipo: "marcar", alvo: "p2" });
  assert.throws(() => agir(j, j.ordem[0], { tipo: "marcar", alvo: "p3" }), /2 pessoas/);
  agir(j, j.ordem[0], { tipo: "marcar", alvo: "p2" }); // desmarca
  assert.throws(() => agir(j, j.ordem[0], { tipo: "propor" }), /Escolha 2/);
});

test("votos ficam secretos até o último; empate rejeita", () => {
  const j = novoJogo(ids(6));
  agir(j, "p0", { tipo: "marcar", alvo: "p0" }); agir(j, "p0", { tipo: "marcar", alvo: "p1" });
  agir(j, "p0", { tipo: "propor" });
  agir(j, "p0", { tipo: "votar", sim: true });
  const v = visaoDe(j, "p1");
  assert.deepEqual(v.jaVotaram, ["p0"]); assert.equal(v.meuVoto, null); assert.equal(v.ultima, null);
  agir(j, "p0", { tipo: "votar", sim: false }); // muda de ideia
  ["p1", "p2"].forEach(p => agir(j, p, { tipo: "votar", sim: true }));
  ["p3", "p4", "p5"].forEach(p => agir(j, p, { tipo: "votar", sim: p !== "p5" ? false : true }));
  // 3 a favor (p1, p2, p5) x 3 contra: rejeitada
  assert.equal(j.fase, "votoRes");
  assert.equal(j.hist[0].aprovada, false);
  assert.equal(j.rejeicoes, 1);
  agir(j, "p3", { tipo: "seguir" });
  assert.equal(liderAtual(j), "p1");
  assert.equal(j.tentativa, 2);
});

test("cinco rejeições seguidas: espiões vencem", () => {
  const j = novoJogo(ids(5));
  for (let k = 0; k < 5; k++) {
    aprovarEquipe(j, j.ordem.slice(0, 2), false);
    agir(j, "p0", { tipo: "seguir" });
  }
  assert.deepEqual(j.fim, { vencedor: "espioes", motivo: "rejeicoes" });
});

test("resistência não pode sabotar; ninguém sabe quem jogou o quê", () => {
  const j = novoJogo(ids(5));
  const r = res(j), e = j.espioes[0];
  aprovarEquipe(j, [r[0], e]);
  agir(j, "p0", { tipo: "seguir" });
  assert.throws(() => agir(j, r[0], { tipo: "carta", sucesso: false }), /sempre joga Sucesso/);
  assert.throws(() => agir(j, r[1], { tipo: "carta", sucesso: true }), /não está nesta equipe/);
  agir(j, r[0], { tipo: "carta", sucesso: true });
  assert.deepEqual(visaoDe(j, r[1]).jaJogaram, [r[0]]);
  assert.equal(visaoDe(j, r[1]).minhaCarta, null);
  assert.throws(() => agir(j, r[0], { tipo: "carta", sucesso: true }), /já jogou/);
  agir(j, e, { tipo: "carta", sucesso: false });
  assert.equal(j.fase, "missaoRes");
  assert.deepEqual(j.cartas, {});
  assert.equal(j.resultados[0].ok, false);
  assert.deepEqual(visaoDe(j, r[1]).cartas, [null, null]);
  assert.throws(() => agir(j, "p1", { tipo: "seguir" }), /Virem/);
  agir(j, "p1", { tipo: "virar" });
  agir(j, "p1", { tipo: "virar", todas: true });
  assert.equal(visaoDe(j, r[1]).cartas.filter(c => c === false).length, 1);
  agir(j, "p1", { tipo: "seguir" });
  assert.equal(j.missao, 1); assert.equal(liderAtual(j), "p1");
});

test("4ª missão com 7 pessoas precisa de 2 fracassos", () => {
  const j = novoJogo(ids(7));
  j.missao = 3; j.hist.push({});
  const e = j.espioes, r = res(j);
  const equipe = [e[0], r[0], r[1], r[2]];
  j.equipe = equipe; j.fase = "missao"; j.hist = [{ resultado: null }];
  agir(j, e[0], { tipo: "carta", sucesso: false });
  for (const p of r.slice(0, 3)) agir(j, p, { tipo: "carta", sucesso: true });
  assert.equal(j.resultados[3].ok, true);
  assert.equal(j.resultados[3].falhas, 1);
});

test("três sucessos: resistência vence; histórico some se desligado", () => {
  const j = novoJogo(ids(5), { historico: false });
  const r = res(j);
  for (let m = 0; m < 3; m++) {
    aprovarEquipe(j, r.slice(0, TAMANHOS[5][m]));
    agir(j, "p0", { tipo: "seguir" });
    for (const p of j.equipe) agir(j, p, { tipo: "carta", sucesso: true });
    assert.deepEqual(visaoDe(j, "p0").hist, []);
    assert.equal(visaoDe(j, "p0").resultados[m].equipe, null);
    agir(j, "p0", { tipo: "virar", todas: true });
    agir(j, "p0", { tipo: "seguir" });
  }
  assert.deepEqual(j.fim, { vencedor: "resistencia", motivo: "missoes" });
  const v = visaoDe(j, "p0");
  assert.equal(v.hist.length, 3);
  assert.deepEqual(v.espioes, j.espioes);
});

test("passo errado é recusado (dois toques ao mesmo tempo)", () => {
  const j = novoJogo(ids(5));
  aprovarEquipe(j, j.ordem.slice(0, 2));
  const passo = j.passo;
  agir(j, "p1", { tipo: "seguir", passo });
  assert.throws(() => agir(j, "p2", { tipo: "seguir", passo }), /Alguém já fez isso/);
});
