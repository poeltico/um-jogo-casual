// Regras do Zodiac: tudo o que decide o jogo, sem nada de rede.
// O servidor (sala.js) chama estas funções; os testes também.

export const CONSTELACOES = ["escorpiao", "touro", "leao", "virgem", "gemeos"];
export const COPIAS = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 };
export const MAX_LUNETAS = 8;
export const MAX_NUVENS = 3;
export const MIN_JOGADORES = 2;
export const MAX_JOGADORES = 5;
export const NIVEIS = ["facil", "normal", "dificil"];

export function tamanhoMao(n) {
  return n <= 3 ? 5 : 4;
}

export function novoBaralho(aleatorio = Math.random) {
  const cartas = [];
  let id = 1;
  for (const c of CONSTELACOES) {
    for (const n of [1, 2, 3, 4, 5]) {
      for (let k = 0; k < COPIAS[n]; k++) cartas.push({ id: id++, c, n });
    }
  }
  for (let i = cartas.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [cartas[i], cartas[j]] = [cartas[j], cartas[i]];
  }
  return cartas;
}

// ordem: ids dos jogadores no sentido horário, começando por quem joga primeiro.
// A mão fica sempre em ordem de chegada: a carta mais velha à esquerda, a nova entra à direita.
// Ninguém reordena as cartas (é assim que a mesa sabe de quais cartas já se tem informação).
export function novoJogo(ordem, nivel = "normal", aleatorio = Math.random) {
  if (ordem.length < MIN_JOGADORES || ordem.length > MAX_JOGADORES) throw new ErroJogo("O Zodiac é para 2 a 5 pessoas.");
  if (!NIVEIS.includes(nivel)) nivel = "normal";
  const baralho = novoBaralho(aleatorio);
  const maos = {};
  const t = tamanhoMao(ordem.length);
  for (const pid of ordem) maos[pid] = [];
  for (let k = 0; k < t; k++) {
    for (const pid of ordem) maos[pid].push({ ...baralho.pop(), marcas: [] });
  }
  const acesas = {};
  for (const c of CONSTELACOES) acesas[c] = 0;
  return {
    nivel,
    ordem: [...ordem],
    baralho,
    maos,
    acesas,
    descarte: [],
    lunetas: MAX_LUNETAS,
    nuvens: 0,
    vez: 0,
    turno: 1,
    restantes: null, // depois que o baralho acaba: quantas vezes ainda faltam
    historico: [],
    fim: null
  };
}

export class ErroJogo extends Error {}

function exigir(cond, msg) {
  if (!cond) throw new ErroJogo(msg);
}

export function jogadorDaVez(j) {
  return j.ordem[j.vez];
}

export function pontos(j) {
  return CONSTELACOES.reduce((a, c) => a + j.acesas[c], 0);
}

function acharCarta(j, pid, cartaId) {
  const i = j.maos[pid].findIndex(x => x.id === cartaId);
  exigir(i >= 0, "Essa carta não está na sua mão.");
  return i;
}

function comprar(j, pid) {
  if (j.baralho.length > 0) {
    j.maos[pid].push({ ...j.baralho.pop(), marcas: [] });
    if (j.baralho.length === 0) j.restantes = j.ordem.length;
  }
}

function fecharVez(j) {
  if (j.fim) return;
  if (pontos(j) === CONSTELACOES.length * 5) {
    j.fim = { motivo: "perfeito", pontos: 25 };
    return;
  }
  if (j.restantes != null && j.historico.at(-1).baralhoAcabouAgora !== true) {
    j.restantes--;
    if (j.restantes <= 0) {
      j.fim = { motivo: "baralho", pontos: pontos(j) };
      return;
    }
  }
  j.vez = (j.vez + 1) % j.ordem.length;
  j.turno++;
}

// Ação de um jogador. Lança ErroJogo se não vale. Retorna o registro do histórico.
export function agir(j, pid, acao) {
  exigir(!j.fim, "A partida já acabou.");
  if (acao.tipo === "anotar") return anotar(j, pid, acao);
  exigir(jogadorDaVez(j) === pid, "Não é a sua vez.");
  const tinhaBaralho = j.baralho.length > 0;
  let reg;
  if (acao.tipo === "dica") reg = darDica(j, pid, acao);
  else if (acao.tipo === "acender") reg = acender(j, pid, acao.carta);
  else if (acao.tipo === "guardar") reg = guardar(j, pid, acao.carta);
  else throw new ErroJogo("Jogada desconhecida.");
  reg.turno = j.turno;
  reg.jogador = pid;
  if (tinhaBaralho && j.baralho.length === 0) reg.baralhoAcabouAgora = true;
  j.historico.push(reg);
  fecharVez(j);
  return reg;
}

function darDica(j, pid, { alvo, cor, numero }) {
  exigir(j.lunetas > 0, "Acabaram as lunetas. Acenda ou guarde uma carta.");
  exigir(alvo !== pid && j.maos[alvo], "Escolha outra pessoa para a dica.");
  exigir((cor != null) !== (numero != null), "A dica é de uma constelação ou de um número.");
  if (cor != null) exigir(CONSTELACOES.includes(cor), "Constelação desconhecida.");
  if (numero != null) exigir([1, 2, 3, 4, 5].includes(numero), "Número desconhecido.");
  const bate = x => (cor != null ? x.c === cor : x.n === numero);
  const tocadas = j.maos[alvo].filter(bate).map(x => x.id);
  exigir(tocadas.length > 0, "A dica precisa apontar pelo menos uma carta.");
  j.lunetas--;
  for (const x of j.maos[alvo]) {
    x.marcas.push({ turno: j.turno, cor: cor ?? null, numero: numero ?? null, sim: bate(x) });
  }
  return { tipo: "dica", alvo, cor: cor ?? null, numero: numero ?? null, cartas: tocadas };
}

function acender(j, pid, cartaId) {
  const i = acharCarta(j, pid, cartaId);
  const [x] = j.maos[pid].splice(i, 1);
  const carta = { id: x.id, c: x.c, n: x.n };
  let ok = j.acesas[x.c] === x.n - 1;
  let bonus = false;
  if (ok) {
    j.acesas[x.c] = x.n;
    if (x.n === 5 && j.lunetas < MAX_LUNETAS) {
      j.lunetas++;
      bonus = true;
    }
  } else {
    j.descarte.push(carta);
    j.nuvens++;
  }
  comprar(j, pid);
  if (j.nuvens >= MAX_NUVENS) j.fim = { motivo: "nuvens", pontos: 0 };
  return { tipo: "acender", carta, ok, bonus };
}

function guardar(j, pid, cartaId) {
  exigir(j.lunetas < MAX_LUNETAS, "Todas as lunetas estão livres. Dê uma dica ou acenda uma carta.");
  const i = acharCarta(j, pid, cartaId);
  const [x] = j.maos[pid].splice(i, 1);
  const carta = { id: x.id, c: x.c, n: x.n };
  j.descarte.push(carta);
  j.lunetas++;
  comprar(j, pid);
  return { tipo: "guardar", carta };
}

// Suspeitas que a própria pessoa anota nas suas cartas (só Fácil e Normal).
// nota: { c: constelação ou null, n: número ou null }. Só o dono vê.
function anotar(j, pid, { carta, c, n }) {
  exigir(j.nivel !== "dificil", "No modo Difícil não tem anotação: é tudo de cabeça.");
  const mao = j.maos[pid];
  exigir(mao, "Você não está nesta partida.");
  const x = mao.find(y => y.id === carta);
  exigir(x, "Essa carta não está na sua mão.");
  exigir(c == null || CONSTELACOES.includes(c), "Constelação desconhecida.");
  exigir(n == null || [1, 2, 3, 4, 5].includes(n), "Número desconhecido.");
  x.nota = c == null && n == null ? null : { c: c ?? null, n: n ?? null };
  return null;
}

// Quais marcas de dica cada nível mostra.
// Fácil: todas, inclusive o complemento ("não é 1" nas cartas que a dica não apontou).
// Normal: só as cartas apontadas na última rodada (as N últimas vezes); o resto a pessoa anota se quiser.
// Difícil: nenhuma.
export function marcasVisiveis(j, marcas) {
  if (j.nivel === "facil") return marcas;
  if (j.nivel === "dificil") return [];
  const desde = j.turno - j.ordem.length + (j.fim ? 1 : 0);
  return marcas.filter(m => m.sim && m.turno >= desde);
}

// O que um celular pode ver: tudo, menos as próprias cartas.
export function visaoDe(j, pid) {
  const maos = {};
  for (const outro of j.ordem) {
    maos[outro] = j.maos[outro].map(x => {
      const marcas = marcasVisiveis(j, x.marcas);
      if (outro === pid && !j.fim) return { id: x.id, marcas, nota: j.nivel === "dificil" ? null : x.nota || null };
      return { id: x.id, c: x.c, n: x.n, marcas };
    });
  }
  const hist = j.nivel === "facil" ? j.historico : j.nivel === "normal" ? j.historico.slice(-j.ordem.length) : j.historico.slice(-1);
  return {
    nivel: j.nivel,
    ordem: j.ordem,
    vez: j.vez,
    daVez: jogadorDaVez(j),
    turno: j.turno,
    baralho: j.baralho.length,
    acesas: j.acesas,
    lunetas: j.lunetas,
    nuvens: j.nuvens,
    restantes: j.restantes,
    descarte: j.descarte,
    maos,
    historico: hist.map(r => ocultarHistorico(r, pid, j)),
    ultima: j.historico.length ? ocultarHistorico(j.historico.at(-1), pid, j) : null,
    pontos: pontos(j),
    fim: j.fim
  };
}

function ocultarHistorico(r, pid, j) {
  // O histórico não revela cartas que ainda estão na mão de alguém.
  const { baralhoAcabouAgora, ...resto } = r;
  return resto;
}

// ===== Ordem da mesa =====
// esquerda: { pid: pid de quem está à esquerda dele }. Sentido horário: quem está à sua esquerda joga depois de você.
// Retorna { ok: true, roda: [pids] } ou { ok: false, faltam: [pids], conflitos: [pids] }.
export function montarRoda(ids, esquerda) {
  const faltam = ids.filter(p => !esquerda[p] || !ids.includes(esquerda[p]) || esquerda[p] === p);
  const alvos = {};
  for (const p of ids) {
    const e = esquerda[p];
    if (!e || faltam.includes(p)) continue;
    (alvos[e] ||= []).push(p);
  }
  const conflitos = Object.values(alvos).filter(l => l.length > 1).flat();
  if (faltam.length || conflitos.length) return { ok: false, faltam, conflitos };
  const roda = [ids[0]];
  let atual = esquerda[ids[0]];
  while (atual !== ids[0]) {
    roda.push(atual);
    atual = esquerda[atual];
    if (roda.length > ids.length) break;
  }
  if (roda.length !== ids.length) {
    // Duas rodas separadas: ninguém repetiu, mas a mesa não fecha.
    return { ok: false, faltam: [], conflitos: [], rodaQuebrada: true };
  }
  return { ok: true, roda };
}

export function girarRoda(roda, primeiro) {
  const i = roda.indexOf(primeiro);
  if (i < 0) throw new ErroJogo("Essa pessoa não está na mesa.");
  return [...roda.slice(i), ...roda.slice(0, i)];
}

export function frase(p) {
  if (p <= 10) return "Noite nublada";
  if (p <= 17) return "Dá pra ver umas estrelas";
  if (p <= 22) return "Céu de interior";
  return "Via Láctea";
}
