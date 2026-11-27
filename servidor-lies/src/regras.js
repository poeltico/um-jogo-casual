// Regras do Lies (modo básico: Resistência contra Espiões), sem nada de rede.
// O servidor (sala.js) chama estas funções; os testes também.

export const MIN_JOGADORES = 5;
export const MAX_JOGADORES = 10;
export const ESPIOES = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
export const TAMANHOS = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5]
};
export const VITORIA = 3;
export const MAX_REJEICOES = 5;

export class ErroJogo extends Error {}
function exigir(cond, msg) {
  if (!cond) throw new ErroJogo(msg);
}

// Com 7 ou mais pessoas, a 4ª missão só cai com 2 fracassos.
export function falhasPrecisa(n, missao) {
  return n >= 7 && missao === 3 ? 2 : 1;
}

function embaralhar(a, aleatorio) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ordem: ids no sentido horário, começando pelo primeiro líder.
export function novoJogo(ordem, opcoes = {}, aleatorio = Math.random) {
  const n = ordem.length;
  exigir(n >= MIN_JOGADORES && n <= MAX_JOGADORES, "O Lies é para 5 a 10 pessoas.");
  const espioes = embaralhar([...ordem], aleatorio).slice(0, ESPIOES[n]);
  return {
    id: Math.floor(aleatorio() * 36 ** 6).toString(36),
    ordem: [...ordem],
    espioes,
    historico: opcoes.historico !== false,
    lider: 0, // índice em ordem
    missao: 0,
    tentativa: 1,
    rejeicoes: 0,
    resultados: [null, null, null, null, null],
    fase: "equipe", // equipe | voto | votoRes | missao | missaoRes | fim
    equipe: [],
    votos: {},
    cartas: {}, // pid -> true (sucesso) | false (fracasso), só durante a missão
    reveladas: [], // cartas embaralhadas da missão
    revelado: 0,
    hist: [],
    passo: 0, // muda a cada jogada; evita que dois toques avancem duas vezes
    fim: null
  };
}

export const liderAtual = j => j.ordem[j.lider];
export const tamanhoEquipe = j => TAMANHOS[j.ordem.length][j.missao];
export const ehEspiao = (j, pid) => j.espioes.includes(pid);
const placar = j => ({
  resistencia: j.resultados.filter(r => r && r.ok).length,
  espioes: j.resultados.filter(r => r && !r.ok).length
});

export function agir(j, pid, acao) {
  exigir(!j.fim, "A partida já acabou.");
  exigir(j.ordem.includes(pid), "Você não está nesta partida.");
  if (acao.passo != null) exigir(acao.passo === j.passo, "Alguém já fez isso. A tela foi atualizada.");
  switch (acao.tipo) {
    case "marcar": marcar(j, pid, acao.alvo); break;
    case "propor": propor(j, pid); break;
    case "votar": votar(j, pid, acao.sim); break;
    case "carta": carta(j, pid, acao.sucesso); break;
    case "virar": virar(j, acao.todas); break;
    case "seguir": seguir(j); break;
    default: throw new ErroJogo("Jogada desconhecida.");
  }
  j.passo++;
}

function marcar(j, pid, alvo) {
  exigir(j.fase === "equipe", "Agora não é hora de montar a equipe.");
  exigir(pid === liderAtual(j), "Só o líder monta a equipe.");
  exigir(j.ordem.includes(alvo), "Essa pessoa não está na mesa.");
  const k = j.equipe.indexOf(alvo);
  if (k >= 0) j.equipe.splice(k, 1);
  else {
    exigir(j.equipe.length < tamanhoEquipe(j), "A equipe desta missão tem " + tamanhoEquipe(j) + " pessoas.");
    j.equipe.push(alvo);
  }
}

function propor(j, pid) {
  exigir(j.fase === "equipe", "Agora não é hora de propor equipe.");
  exigir(pid === liderAtual(j), "Só o líder propõe a equipe.");
  exigir(j.equipe.length === tamanhoEquipe(j), "Escolha " + tamanhoEquipe(j) + " pessoas.");
  j.equipe = j.ordem.filter(p => j.equipe.includes(p)); // na ordem da mesa
  j.votos = {};
  j.fase = "voto";
}

function votar(j, pid, sim) {
  exigir(j.fase === "voto", "A votação já fechou.");
  j.votos[pid] = !!sim;
  if (Object.keys(j.votos).length < j.ordem.length) return;
  const aprovam = j.ordem.filter(p => j.votos[p]).length;
  const aprovada = aprovam > j.ordem.length / 2; // empate rejeita
  j.hist.push({
    missao: j.missao, tentativa: j.tentativa, lider: liderAtual(j), equipe: [...j.equipe],
    votos: { ...j.votos }, aprovada, resultado: null
  });
  j.rejeicoes = aprovada ? 0 : j.rejeicoes + 1;
  j.fase = "votoRes";
}

function carta(j, pid, sucesso) {
  exigir(j.fase === "missao", "Agora não é hora de jogar carta.");
  exigir(j.equipe.includes(pid), "Você não está nesta equipe.");
  exigir(!(pid in j.cartas), "Você já jogou sua carta.");
  exigir(sucesso || ehEspiao(j, pid), "A Resistência sempre joga Sucesso.");
  j.cartas[pid] = !!sucesso;
  if (Object.keys(j.cartas).length < j.equipe.length) return;
  const valores = j.equipe.map(p => j.cartas[p]);
  const falhas = valores.filter(v => !v).length;
  const ok = falhas < falhasPrecisa(j.ordem.length, j.missao);
  j.reveladas = embaralhar(valores, Math.random);
  j.revelado = 0;
  j.cartas = {}; // quem jogou o quê nunca fica guardado
  j.resultados[j.missao] = { ok, falhas, equipe: [...j.equipe] };
  j.hist[j.hist.length - 1].resultado = { ok, falhas };
  j.fase = "missaoRes";
}

function virar(j, todas) {
  exigir(j.fase === "missaoRes", "Não tem carta para virar.");
  j.revelado = todas ? j.reveladas.length : Math.min(j.reveladas.length, j.revelado + 1);
}

function seguir(j) {
  if (j.fase === "votoRes") {
    const ultima = j.hist[j.hist.length - 1];
    if (ultima.aprovada) { j.fase = "missao"; j.cartas = {}; return; }
    if (j.rejeicoes >= MAX_REJEICOES) return acabar(j, "espioes", "rejeicoes");
    j.lider = (j.lider + 1) % j.ordem.length;
    j.tentativa++;
    j.equipe = [];
    j.fase = "equipe";
    return;
  }
  if (j.fase === "missaoRes") {
    exigir(j.revelado >= j.reveladas.length, "Virem todas as cartas primeiro.");
    const p = placar(j);
    if (p.resistencia >= VITORIA) return acabar(j, "resistencia", "missoes");
    if (p.espioes >= VITORIA) return acabar(j, "espioes", "missoes");
    j.missao++;
    j.tentativa = 1;
    j.lider = (j.lider + 1) % j.ordem.length;
    j.equipe = [];
    j.reveladas = [];
    j.revelado = 0;
    j.fase = "equipe";
    return;
  }
  throw new ErroJogo("Ainda não dá para seguir.");
}

function acabar(j, vencedor, motivo) {
  j.fase = "fim";
  j.fim = { vencedor, motivo };
}

// O que cada celular pode ver. Nunca sai daqui quem jogou qual carta,
// e os espiões só aparecem para os próprios espiões (e para todos no fim).
export function visaoDe(j, pid) {
  const espiao = ehEspiao(j, pid);
  const fim = !!j.fim;
  const histVisivel = j.historico || fim;
  return {
    id: j.id,
    ordem: j.ordem,
    lider: liderAtual(j),
    missao: j.missao,
    tentativa: j.tentativa,
    rejeicoes: j.rejeicoes,
    tamanhos: TAMANHOS[j.ordem.length],
    falhasPrecisa: TAMANHOS[j.ordem.length].map((_, m) => falhasPrecisa(j.ordem.length, m)),
    resultados: j.resultados.map(r => r && { ok: r.ok, falhas: r.falhas, equipe: histVisivel ? r.equipe : null }),
    fase: j.fase,
    equipe: j.equipe,
    passo: j.passo,
    historico: j.historico,
    eu: { espiao, parceiros: espiao ? j.espioes.filter(p => p !== pid) : [] },
    totalEspioes: j.espioes.length,
    espioes: fim ? j.espioes : null,
    // Votação: durante, só quem já votou e o seu voto; depois, todos.
    jaVotaram: j.fase === "voto" ? j.ordem.filter(p => p in j.votos) : null,
    meuVoto: j.fase === "voto" && pid in j.votos ? j.votos[pid] : null,
    ultima: j.fase === "votoRes" ? j.hist[j.hist.length - 1] : null,
    // Missão: só quem já jogou e a sua carta.
    jaJogaram: j.fase === "missao" ? j.equipe.filter(p => p in j.cartas) : null,
    minhaCarta: j.fase === "missao" && pid in j.cartas ? j.cartas[pid] : null,
    cartas: j.fase === "missaoRes" || (fim && j.reveladas.length) ? j.reveladas.map((v, i) => (i < j.revelado ? v : null)) : null,
    hist: histVisivel ? j.hist : [],
    fim: j.fim
  };
}

// ===== Ordem da mesa (igual ao Zodiac) =====
// esquerda: { pid: pid de quem está à esquerda dele }. Sentido horário: quem está à sua esquerda joga depois de você.
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
  if (roda.length !== ids.length) return { ok: false, faltam: [], conflitos: [], rodaQuebrada: true };
  return { ok: true, roda };
}

export function girarRoda(roda, primeiro) {
  const i = roda.indexOf(primeiro);
  if (i < 0) throw new ErroJogo("Essa pessoa não está na mesa.");
  return [...roda.slice(i), ...roda.slice(0, i)];
}
