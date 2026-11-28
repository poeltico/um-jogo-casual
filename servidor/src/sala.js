// Uma sala do Zodiac: um Durable Object por código de sala.
// Guarda a partida, recebe as jogadas pelos WebSockets e manda a cada celular só o que ele pode ver.
import { DurableObject } from "cloudflare:workers";
import {
  novoJogo, agir, visaoDe, montarRoda, girarRoda, ErroJogo, NIVEIS, MAX_JOGADORES, MIN_JOGADORES
} from "./regras.js";

const UM_DIA = 24 * 60 * 60 * 1000;

function novoId() {
  return "j" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

function limparNome(nome) {
  return String(nome || "").replace(/\s+/g, " ").trim().slice(0, 16);
}

export class Sala extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Responde o "ping" do celular sem acordar a sala (não gasta nada).
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.s = undefined;
  }

  async carregar() {
    if (this.s === undefined) this.s = (await this.ctx.storage.get("sala")) || null;
    return this.s;
  }

  async salvar() {
    this.s.mexida = Date.now();
    await this.ctx.storage.put("sala", this.s);
    await this.ctx.storage.setAlarm(Date.now() + UM_DIA);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/criar") && req.method === "POST") {
      const s = await this.carregar();
      if (s) return new Response("existe", { status: 409 });
      const { codigo, token, nome, nivel } = await req.json();
      const n = limparNome(nome);
      if (!n || !token) return new Response("dados", { status: 400 });
      const id = novoId();
      this.s = {
        codigo,
        criador: id,
        fase: "espera",
        nivel: NIVEIS.includes(nivel) ? nivel : "normal",
        jogadores: [{ id, nome: n, token }],
        esquerda: {},
        roda: null,
        pausaManual: null,
        pedidos: [],
        jogo: null,
        criada: Date.now()
      };
      await this.salvar();
      return Response.json({ codigo });
    }
    if (req.headers.get("Upgrade") === "websocket") {
      const s = await this.carregar();
      const par = new WebSocketPair();
      const [cliente, servidor] = Object.values(par);
      this.ctx.acceptWebSocket(servidor);
      servidor.serializeAttachment({ pid: null });
      if (!s) {
        servidor.send(JSON.stringify({ t: "naoExiste" }));
        servidor.close(4004, "sala não existe");
      }
      return new Response(null, { status: 101, webSocket: cliente });
    }
    return new Response("não encontrado", { status: 404 });
  }

  // ===== Conexões =====
  sockets(exceto) {
    return this.ctx.getWebSockets().filter(ws => ws !== exceto);
  }

  conectados(exceto) {
    const set = new Set();
    for (const ws of this.sockets(exceto)) {
      const a = ws.deserializeAttachment();
      if (a && a.pid) set.add(a.pid);
    }
    return set;
  }

  pausa(exceto) {
    const s = this.s;
    if (s.fase !== "jogo") return null;
    const on = this.conectados(exceto);
    const faltam = s.jogadores.filter(p => !on.has(p.id)).map(p => p.id);
    if (!faltam.length && !s.pausaManual) return null;
    return { faltam, manual: s.pausaManual };
  }

  estadoPara(pid, exceto) {
    const s = this.s;
    const on = this.conectados(exceto);
    return {
      t: "estado",
      voce: pid,
      sala: {
        codigo: s.codigo,
        fase: s.fase,
        criador: s.criador,
        nivel: s.nivel,
        jogadores: s.jogadores.map(p => ({ id: p.id, nome: p.nome, conectado: on.has(p.id) })),
        esquerda: s.esquerda,
        roda: s.roda,
        rodaStatus: s.fase === "ordem" ? montarRoda(s.jogadores.map(p => p.id), s.esquerda) : null,
        pausa: this.pausa(exceto),
        pedidos: pid === s.criador ? s.pedidos.map(p => ({ id: p.id, nome: p.nome, lugar: p.lugar })) : [],
        jogo: s.jogo ? visaoDe(s.jogo, pid) : null
      }
    };
  }

  transmitir(exceto) {
    for (const ws of this.sockets(exceto)) {
      const a = ws.deserializeAttachment();
      if (a && a.pid) this.enviar(ws, this.estadoPara(a.pid, exceto));
    }
  }

  enviar(ws, msg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // celular já saiu
    }
  }

  // ===== Mensagens =====
  async webSocketMessage(ws, texto) {
    const s = await this.carregar();
    if (!s) return ws.close(4004, "sala não existe");
    let m;
    try {
      m = JSON.parse(texto);
    } catch {
      return;
    }
    const a = ws.deserializeAttachment() || {};
    try {
      if (m.t === "entrar") return await this.entrar(ws, m);
      if (m.t === "pedirLugar") return await this.pedirLugar(ws, a, m);
      if (!a.pid) throw new ErroJogo("Entre na sala primeiro.");
      const eu = a.pid;
      const souCriador = eu === s.criador;
      const soCriador = () => {
        if (!souCriador) throw new ErroJogo("Só quem criou a sala pode fazer isso.");
      };
      switch (m.t) {
        case "nivel":
          soCriador();
          if (s.fase !== "espera") throw new ErroJogo("O nível só muda antes da partida.");
          if (NIVEIS.includes(m.nivel)) s.nivel = m.nivel;
          break;
        case "remover":
          soCriador();
          if (s.fase !== "espera") throw new ErroJogo("Só dá para tirar alguém antes da partida.");
          if (m.pid === s.criador) throw new ErroJogo("Quem criou a sala não pode sair dela.");
          s.jogadores = s.jogadores.filter(p => p.id !== m.pid);
          for (const w of this.sockets()) {
            const x = w.deserializeAttachment();
            if (x && x.pid === m.pid) {
              this.enviar(w, { t: "removido" });
              w.serializeAttachment({ pid: null });
            }
          }
          break;
        case "sair":
          if (s.fase !== "espera") throw new ErroJogo("A partida já começou. Use o botão Pausar se precisar sair.");
          if (souCriador) throw new ErroJogo("Quem criou a sala não pode sair dela.");
          s.jogadores = s.jogadores.filter(p => p.id !== eu);
          ws.serializeAttachment({ pid: null });
          break;
        case "organizar":
          soCriador();
          if (s.jogadores.length < MIN_JOGADORES) throw new ErroJogo("Precisa de pelo menos 2 pessoas.");
          s.fase = "ordem";
          s.esquerda = {};
          s.roda = null;
          if (s.jogadores.length === 2) {
            const [p1, p2] = s.jogadores.map(p => p.id);
            s.esquerda = { [p1]: p2, [p2]: p1 };
          }
          break;
        case "esquerda":
          if (s.fase !== "ordem") throw new ErroJogo("A mesa já está organizada.");
          if (!s.jogadores.some(p => p.id === m.pid) || m.pid === eu) throw new ErroJogo("Escolha outra pessoa.");
          s.esquerda[eu] = m.pid;
          break;
        case "comecar": {
          soCriador();
          if (s.fase !== "ordem") throw new ErroJogo("Organize a mesa primeiro.");
          const r = montarRoda(s.jogadores.map(p => p.id), s.esquerda);
          if (!r.ok) throw new ErroJogo("A roda ainda não fecha. Confiram quem está à esquerda de quem.");
          const primeiro = m.primeiro === "sortear" ? r.roda[Math.floor(Math.random() * r.roda.length)] : m.primeiro;
          s.roda = girarRoda(r.roda, primeiro);
          s.jogo = novoJogo(s.roda, s.nivel);
          s.fase = "jogo";
          s.pausaManual = null;
          break;
        }
        case "jogada": {
          if (s.fase !== "jogo") throw new ErroJogo("A partida não está rolando.");
          const livre = m.acao && m.acao.tipo === "anotar";
          if (!livre && this.pausa()) throw new ErroJogo("A partida está pausada.");
          agir(s.jogo, eu, m.acao || {});
          if (s.jogo.fim) s.fase = "fim";
          break;
        }
        case "pausar": {
          if (s.fase !== "jogo") break;
          const nome = s.jogadores.find(p => p.id === eu)?.nome;
          s.pausaManual = m.on ? nome : null;
          break;
        }
        case "recomecar":
          soCriador();
          if (!s.roda) throw new ErroJogo("Ainda não tem partida para recomeçar.");
          s.jogo = novoJogo(s.roda, s.nivel);
          s.fase = "jogo";
          s.pausaManual = null;
          break;
        case "refazerMesa":
          soCriador();
          s.fase = "ordem";
          s.esquerda = {};
          s.roda = null;
          s.jogo = null;
          break;
        case "voltarEspera":
          soCriador();
          s.fase = "espera";
          s.esquerda = {};
          s.roda = null;
          s.jogo = null;
          break;
        case "devolver": {
          soCriador();
          const ped = s.pedidos.find(p => p.id === m.pedido);
          if (!ped) throw new ErroJogo("Esse pedido já foi resolvido.");
          s.pedidos = s.pedidos.filter(p => p.id !== m.pedido);
          if (m.sim) {
            const lugar = s.jogadores.find(p => p.id === ped.lugar);
            if (lugar) {
              lugar.token = ped.token;
              for (const w of this.sockets()) {
                const x = w.deserializeAttachment();
                if (x && x.pid === lugar.id) {
                  this.enviar(w, { t: "removido" });
                  w.serializeAttachment({ pid: null });
                  w.close(4001, "lugar devolvido em outro celular");
                }
              }
              for (const w of this.sockets()) {
                const x = w.deserializeAttachment();
                if (x && x.pedindo === ped.token) w.serializeAttachment({ pid: lugar.id });
              }
            }
          } else {
            for (const w of this.sockets()) {
              const x = w.deserializeAttachment();
              if (x && x.pedindo === ped.token) this.enviar(w, { t: "erro", msg: "Quem criou a sala não liberou esse lugar." });
            }
          }
          break;
        }
        case "ping":
          return;
        default:
          throw new ErroJogo("Mensagem desconhecida.");
      }
      await this.salvar();
      this.transmitir();
    } catch (e) {
      if (e instanceof ErroJogo) this.enviar(ws, { t: "erro", msg: e.message });
      else {
        console.error(e);
        this.enviar(ws, { t: "erro", msg: "Algo deu errado na sala. Tente de novo." });
      }
    }
  }

  async entrar(ws, { token, nome }) {
    const s = this.s;
    if (!token) throw new ErroJogo("Falta a chave do celular.");
    const ja = s.jogadores.find(p => p.token === token);
    if (ja) {
      ws.serializeAttachment({ pid: ja.id });
      this.transmitir();
      return;
    }
    const n = limparNome(nome);
    if (s.fase === "espera") {
      if (!n) throw new ErroJogo("Escreva seu nome.");
      if (s.jogadores.length >= MAX_JOGADORES) throw new ErroJogo("A sala já tem 5 pessoas, o máximo do Zodiac.");
      if (s.jogadores.some(p => p.nome.toLowerCase() === n.toLowerCase())) throw new ErroJogo("Já tem alguém com esse nome na sala. Use outro.");
      const id = novoId();
      s.jogadores.push({ id, nome: n, token });
      ws.serializeAttachment({ pid: id });
      await this.salvar();
      this.transmitir();
      return;
    }
    // Partida em andamento: só dá para pegar o lugar de quem está fora, com o ok de quem criou a sala.
    const on = this.conectados();
    const livres = s.jogadores.filter(p => !on.has(p.id)).map(p => ({ id: p.id, nome: p.nome }));
    ws.serializeAttachment({ pid: null, pedindo: token });
    this.enviar(ws, { t: "escolherLugar", livres, codigo: s.codigo });
  }

  async pedirLugar(ws, a, { lugar, token }) {
    const s = this.s;
    if (!token || a.pedindo !== token) throw new ErroJogo("Entre na sala de novo.");
    const p = s.jogadores.find(x => x.id === lugar);
    if (!p) throw new ErroJogo("Esse lugar não existe.");
    s.pedidos = s.pedidos.filter(x => x.token !== token && x.lugar !== lugar);
    s.pedidos.push({ id: novoId(), token, lugar, nome: p.nome });
    this.enviar(ws, { t: "aguardando", nome: p.nome });
    await this.salvar();
    this.transmitir();
  }

  async webSocketClose(ws) {
    const s = await this.carregar();
    if (!s) return;
    // Avisa os outros que alguém caiu (a partida pausa sozinha).
    this.transmitir(ws);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    const s = await this.carregar();
    if (!s) return;
    if (this.sockets().length === 0 && Date.now() - (s.mexida || 0) >= UM_DIA - 60000) {
      await this.ctx.storage.deleteAll();
      this.s = null;
    } else {
      await this.ctx.storage.setAlarm(Date.now() + UM_DIA);
    }
  }
}
