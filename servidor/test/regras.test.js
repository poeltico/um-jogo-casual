import test from "node:test";
import assert from "node:assert/strict";
import {
  novoBaralho, novoJogo, agir, visaoDe, montarRoda, girarRoda, pontos, ErroJogo, CONSTELACOES
} from "../src/regras.js";

// Gerador previsível para os testes.
function semente(s) {
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test("baralho tem 50 cartas na distribuição certa", () => {
  const b = novoBaralho(semente(1));
  assert.equal(b.length, 50);
  for (const c of CONSTELACOES) {
    const n = k => b.filter(x => x.c === c && x.n === k).length;
    assert.deepEqual([n(1), n(2), n(3), n(4), n(5)], [3, 2, 2, 2, 1]);
  }
  assert.equal(new Set(b.map(x => x.id)).size, 50);
});

test("mãos de 5 cartas com 2 ou 3 pessoas e de 4 com 4 ou 5", () => {
  assert.equal(novoJogo(["a", "b", "c"]).maos.a.length, 5);
  assert.equal(novoJogo(["a", "b", "c", "d"]).maos.d.length, 4);
  assert.throws(() => novoJogo(["a"]), ErroJogo);
  assert.throws(() => novoJogo(["a", "b", "c", "d", "e", "f"]), ErroJogo);
});

function jogoFixo(maos, baralho = []) {
  const j = novoJogo(Object.keys(maos), "facil", semente(3));
  let id = 100;
  for (const [p, cartas] of Object.entries(maos)) j.maos[p] = cartas.map(([c, n]) => ({ id: id++, c, n, marcas: [] }));
  j.baralho = baralho.map(([c, n]) => ({ id: id++, c, n }));
  return j;
}

test("dica gasta luneta e marca as cartas certas", () => {
  const j = jogoFixo({ a: [["leao", 1], ["touro", 2]], b: [["leao", 3], ["leao", 1], ["virgem", 1]] }, [["gemeos", 1], ["gemeos", 2]]);
  const r = agir(j, "a", { tipo: "dica", alvo: "b", cor: "leao" });
  assert.equal(j.lunetas, 7);
  assert.equal(r.cartas.length, 2);
  assert.deepEqual(j.maos.b.map(x => x.marcas[0].sim), [true, true, false]);
  assert.equal(j.vez, 1);
});

test("não dá para dar dica que não aponta carta nem dar dica a si mesmo", () => {
  const j = jogoFixo({ a: [["leao", 1]], b: [["touro", 3]] }, [["gemeos", 1]]);
  assert.throws(() => agir(j, "a", { tipo: "dica", alvo: "b", cor: "leao" }), /pelo menos uma/);
  assert.throws(() => agir(j, "a", { tipo: "dica", alvo: "a", numero: 1 }), /outra pessoa/);
  assert.throws(() => agir(j, "b", { tipo: "dica", alvo: "a", numero: 1 }), /Não é a sua vez/);
});

test("acender certo sobe a constelação; errado traz nuvem", () => {
  const j = jogoFixo({ a: [["leao", 1], ["leao", 3]], b: [["touro", 1]] }, [["gemeos", 1], ["gemeos", 2], ["gemeos", 3]]);
  const r1 = agir(j, "a", { tipo: "acender", carta: 100 });
  assert.ok(r1.ok);
  assert.equal(j.acesas.leao, 1);
  agir(j, "b", { tipo: "acender", carta: 102 });
  const r3 = agir(j, "a", { tipo: "acender", carta: 101 });
  assert.equal(r3.ok, false);
  assert.equal(j.nuvens, 1);
  assert.equal(j.descarte.length, 1);
});

test("três nuvens zeram a partida", () => {
  const j = jogoFixo({ a: [["leao", 3], ["leao", 4], ["leao", 5]], b: [["touro", 1]] }, [["gemeos", 1], ["gemeos", 2], ["gemeos", 3], ["gemeos", 4]]);
  j.acesas.touro = 0;
  agir(j, "a", { tipo: "acender", carta: 100 });
  agir(j, "b", { tipo: "dica", alvo: "a", cor: "leao" });
  agir(j, "a", { tipo: "acender", carta: 101 });
  agir(j, "b", { tipo: "dica", alvo: "a", cor: "leao" });
  agir(j, "a", { tipo: "acender", carta: 102 });
  assert.deepEqual(j.fim, { motivo: "nuvens", pontos: 0 });
  assert.throws(() => agir(j, "b", { tipo: "dica", alvo: "a", numero: 1 }), /acabou/);
});

test("guardar devolve luneta, mas não com as 8 livres", () => {
  const j = jogoFixo({ a: [["leao", 3]], b: [["touro", 1]] }, [["gemeos", 1], ["gemeos", 2]]);
  assert.throws(() => agir(j, "a", { tipo: "guardar", carta: 100 }), /lunetas/);
  agir(j, "a", { tipo: "dica", alvo: "b", numero: 1 });
  agir(j, "b", { tipo: "guardar", carta: 101 });
  assert.equal(j.lunetas, 8);
  assert.equal(j.maos.b.length, 1);
});

test("completar uma constelação devolve luneta", () => {
  const j = jogoFixo({ a: [["leao", 5]], b: [["touro", 1]] }, [["gemeos", 1], ["gemeos", 2]]);
  j.acesas.leao = 4;
  j.lunetas = 5;
  const r = agir(j, "a", { tipo: "acender", carta: 100 });
  assert.ok(r.bonus);
  assert.equal(j.lunetas, 6);
});

test("quando o baralho acaba, cada pessoa joga mais uma vez", () => {
  const j = jogoFixo({ a: [["leao", 1], ["leao", 2]], b: [["touro", 1], ["touro", 2]], c: [["virgem", 1]] }, [["gemeos", 1]]);
  agir(j, "a", { tipo: "acender", carta: 100 }); // compra a última carta
  assert.equal(j.baralho.length, 0);
  assert.equal(j.restantes, 3);
  agir(j, "b", { tipo: "acender", carta: 102 });
  agir(j, "c", { tipo: "acender", carta: 104 });
  assert.equal(j.fim, null);
  agir(j, "a", { tipo: "acender", carta: 101 });
  assert.equal(j.fim.motivo, "baralho");
  assert.equal(j.fim.pontos, pontos(j));
  assert.equal(j.fim.pontos, 4);
});

test("céu perfeito termina com 25", () => {
  const j = jogoFixo({ a: [["gemeos", 5]], b: [["touro", 1]] }, [["virgem", 1]]);
  for (const c of CONSTELACOES) j.acesas[c] = 5;
  j.acesas.gemeos = 4;
  agir(j, "a", { tipo: "acender", carta: 100 });
  assert.deepEqual(j.fim, { motivo: "perfeito", pontos: 25 });
});

test("o celular não recebe as próprias cartas", () => {
  const j = novoJogo(["a", "b", "c"], "facil", semente(5));
  const v = visaoDe(j, "a");
  assert.ok(v.maos.a.every(x => x.c === undefined && x.n === undefined));
  assert.ok(v.maos.b.every(x => x.c && x.n));
  assert.ok(!JSON.stringify(v).includes('"baralho":[')); // só a quantidade do baralho
});

test("níveis de lembrança das dicas", () => {
  const base = { a: [["leao", 1]], b: [["leao", 2]], c: [["touro", 1]] };
  const fazer = nivel => {
    const j = jogoFixo(base, [["gemeos", 1], ["gemeos", 2], ["gemeos", 3], ["gemeos", 4], ["gemeos", 5]]);
    j.nivel = nivel;
    agir(j, "a", { tipo: "dica", alvo: "b", cor: "leao" }); // turno 1
    agir(j, "b", { tipo: "dica", alvo: "c", numero: 1 }); // turno 2
    agir(j, "c", { tipo: "dica", alvo: "a", numero: 1 }); // turno 3
    return j;
  };
  assert.equal(visaoDe(fazer("facil"), "b").maos.b[0].marcas.length, 1);
  // Fácil anota o complemento: a carta de "c" não apontada pela dica de número 1? Ela é 1, então é sim.
  const f = fazer("facil");
  assert.deepEqual(visaoDe(f, "a").maos.c[0].marcas.map(m => m.sim), [true]);
  const comp = jogoFixo({ a: [["leao", 1]], b: [["leao", 2], ["touro", 1]] }, [["gemeos", 1]]);
  agir(comp, "a", { tipo: "dica", alvo: "b", numero: 1 });
  assert.deepEqual(visaoDe(comp, "b").maos.b.map(x => x.marcas[0].sim), [false, true]);
  comp.nivel = "normal";
  assert.deepEqual(visaoDe(comp, "b").maos.b.map(x => x.marcas.length), [0, 1]);
  assert.equal(visaoDe(fazer("dificil"), "b").maos.b[0].marcas.length, 0);
  const n = fazer("normal");
  assert.equal(visaoDe(n, "b").maos.b[0].marcas.length, 1); // turno 1 ainda é da última rodada
  agir(n, "a", { tipo: "dica", alvo: "c", cor: "touro" }); // turno 4
  assert.equal(visaoDe(n, "b").maos.b[0].marcas.length, 0);
});

test("as cartas não mudam de lugar: a nova entra sempre à direita", () => {
  const j = jogoFixo({ a: [["leao", 1], ["leao", 2], ["touro", 3]], b: [["touro", 1]] }, [["gemeos", 1], ["gemeos", 2]]);
  assert.throws(() => agir(j, "a", { tipo: "reordenar", ordem: [102, 101, 100] }), /desconhecida/);
  agir(j, "a", { tipo: "acender", carta: 101 });
  assert.deepEqual(j.maos.a.map(x => x.c + x.n), ["leao1", "touro3", "gemeos2"]);
});

test("ordem da mesa: roda fechada, conflitos e roda quebrada", () => {
  const ids = ["ana", "beto", "cris", "duda"];
  const ok = montarRoda(ids, { ana: "beto", beto: "cris", cris: "duda", duda: "ana" });
  assert.deepEqual(ok, { ok: true, roda: ["ana", "beto", "cris", "duda"] });
  assert.deepEqual(girarRoda(ok.roda, "cris"), ["cris", "duda", "ana", "beto"]);
  const conflito = montarRoda(ids, { ana: "beto", beto: "cris", cris: "beto", duda: "ana" });
  assert.equal(conflito.ok, false);
  assert.deepEqual(conflito.conflitos.sort(), ["ana", "cris"]);
  const falta = montarRoda(ids, { ana: "beto", beto: "cris", cris: "duda" });
  assert.deepEqual(falta.faltam, ["duda"]);
  const quebrada = montarRoda(ids, { ana: "beto", beto: "ana", cris: "duda", duda: "cris" });
  assert.equal(quebrada.ok, false);
  assert.ok(quebrada.rodaQuebrada);
});

test("partida aleatória inteira sempre termina", () => {
  for (let s = 1; s <= 200; s++) {
    const r = semente(s);
    const ids = ["a", "b", "c", "d", "e"].slice(0, 2 + (s % 4));
    const j = novoJogo(ids, "normal", r);
    let passos = 0;
    while (!j.fim && passos++ < 500) {
      const p = ids[j.vez];
      const mao = j.maos[p];
      const escolha = r();
      try {
        if (escolha < 0.3 && j.lunetas > 0) {
          const alvo = ids[(j.vez + 1) % ids.length];
          agir(j, p, { tipo: "dica", alvo, numero: j.maos[alvo][0].n });
        } else if (escolha < 0.6 && j.lunetas < 8) {
          agir(j, p, { tipo: "guardar", carta: mao[0].id });
        } else {
          agir(j, p, { tipo: "acender", carta: mao[Math.floor(r() * mao.length)].id });
        }
      } catch (e) {
        if (!(e instanceof ErroJogo)) throw e;
        agir(j, p, j.lunetas < 8 ? { tipo: "guardar", carta: mao[0].id } : { tipo: "acender", carta: mao[0].id });
      }
    }
    assert.ok(j.fim, "partida " + s + " não terminou");
    assert.ok(j.fim.pontos >= 0 && j.fim.pontos <= 25);
  }
});

test("anotações de suspeita: só o dono vê e não existem no Difícil", () => {
  const j = jogoFixo({ a: [["leao", 1]], b: [["touro", 1]] }, []);
  agir(j, "a", { tipo: "anotar", carta: 100, c: "leao", n: null });
  assert.deepEqual(visaoDe(j, "a").maos.a[0].nota, { c: "leao", n: null });
  assert.equal(visaoDe(j, "b").maos.a[0].nota, undefined);
  agir(j, "a", { tipo: "anotar", carta: 100 });
  assert.equal(visaoDe(j, "a").maos.a[0].nota, null);
  j.nivel = "dificil";
  assert.throws(() => agir(j, "a", { tipo: "anotar", carta: 100, n: 2 }), /Difícil/);
});
