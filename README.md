# Um Jogo Casual

Jogos para a turma jogar na mesma sala, cada um no seu celular (ou passando um celular só).
É um app web instalável: abre no navegador e pode ir para a tela inicial do celular.

## Jogos

### Pabla
Cantarole uma música sem nenhuma palavra e faça seu time adivinhar o artista e o título.

- Modos: Clássico (em times, quem acerta continua), Uma vez por time (sugerido com mais de 15 pessoas), Corrida (cada um por si) e Blitz (10 músicas em 1 minuto, 1 ponto por acerto, 10 rodadas por time por padrão (dá para mudar na preparação); as músicas já tocadas não repetem neste celular).
- Carta com 3 músicas e 1 Desafio, que vale o dobro.
- 40 segundos por música, com apito quando faltam 15 (aí a coreografia está liberada).
- Artista vale 3, título vale 5. Vence quem chegar a 50 pontos.
- Funciona hoje no modo de celular único. Próximos passos: um celular por time e juiz por voz.

O plano completo do jogo está no documento do projeto.

### Zodiac
Jogo cooperativo de 2 a 5 pessoas, cada uma no seu celular: acendam as constelações de Escorpião, Touro, Leão, Virgem e Gêmeos, da estrela 1 à 5, sem ver as próprias cartas.

- Dicas gastam lunetas (8). Carta errada vira nuvem; na 3ª nuvem a partida acaba com 0 pontos.
- Antes de começar, cada celular pergunta quem está sentado à esquerda; a vez anda no sentido horário e quem criou a sala escolhe quem começa (ou sorteia).
- As cartas não mudam de lugar: a mais velha fica à esquerda, a nova entra à direita.
- Níveis: Fácil (o app lembra todas as dicas e anota o complemento, "não é 1"), Normal (só as cartas apontadas na última rodada) e Difícil (nada fica anotado). No Fácil e no Normal cada um pode anotar suas suspeitas.
- À prova de pizza: se alguém cai, a partida pausa para todos e volta quando todos reconectam.
- Página: `zodiac/index.html`. Servidor das salas: pasta `servidor/`.

### Lies
Jogo de blefe de 5 a 10 pessoas, cada uma no seu celular (modo básico: Resistência contra Espiões).

- Cada celular mostra o próprio papel; os espiões veem quem são os outros espiões.
- O líder monta a equipe no celular dele, todos votam escondido e os votos aparecem juntos no final. Empate rejeita; 5 rejeições seguidas dão a vitória aos espiões.
- Na missão, só a equipe joga Sucesso ou Fracasso (a Resistência não consegue jogar Fracasso). As cartas são embaralhadas e viradas uma a uma; o servidor nunca guarda quem jogou o quê.
- Opção da sala: histórico de votações e equipes (ligado ou desligado). No fim aparece tudo de qualquer jeito.
- A liderança anda no sentido horário: antes de começar, cada um responde quem está à sua esquerda.
- À prova de pizza: se alguém cai, a partida pausa para todos.
- Página: `lies/index.html`. Servidor das salas: pasta `servidor-lies/` (Worker `lies-salas`, https://lies-salas.poeltico.workers.dev).

## Arquivos

| Arquivo | Para quê |
| --- | --- |
| `index.html` | Home, Pabla, regras e o pacote Base de músicas |
| `catalogo.js` | Pacotes do catálogo (Sertanejo 90, Pagode 90, Emo e rock 2000, MPB e rock BR) |
| `zodiac/index.html` | O Zodiac (telas do jogo; fala com o servidor das salas) |
| `servidor/` | Worker da Cloudflare com as salas do Zodiac (Durable Objects) e os testes das regras |
| `lies/index.html` | O Lies (telas do jogo; fala com o servidor das salas) |
| `servidor-lies/` | Worker da Cloudflare com as salas do Lies (Durable Objects) e os testes das regras |
| `manifest.webmanifest` | Nome, cores e ícones para instalar na tela inicial |
| `sw.js` | Guarda o app no aparelho para abrir sem internet |
| `icons/` | Ícones do app |
| `_headers` | Regras de cache do Cloudflare Pages |

## Músicas

O pacote Base fica em `index.html`, na constante `PACOTE_BASE`.
Cada música é `[título, artista, trecho da letra]`, com no máximo uma ou duas frases da letra.

Os outros pacotes ficam em `catalogo.js`, gerado da planilha "Catálogo de músicas – Jogo da Pabla".
Cada música é `"Artista|Música|H"` (hit) ou `"Artista|Música|F"` (de fã). Hits entram como músicas normais da carta e as de fã como Desafio.
Para não embaralhar o histórico da Blitz, acrescente músicas novas no fim da lista de cada pacote.

## Publicar

O app está no Cloudflare Pages: https://um-jogo-casual.pages.dev

Cada envio para a branch `main` publica sozinho, sem etapa de build (os arquivos da raiz são servidos como estão).
Branches diferentes de `main` ganham um link de prévia próprio.

Depois de mudar algum arquivo do app, aumente `VERSAO` em `sw.js` para os celulares baixarem a versão nova.

## Servidor das salas (Zodiac)

O Zodiac precisa que os celulares conversem. Cada sala é um Durable Object no Worker `zodiac-salas`,
publicado em https://zodiac-salas.poeltico.workers.dev (plano gratuito da Cloudflare).

```bash
cd servidor
npm install
npm test                      # regras do jogo
npx wrangler dev              # servidor local em http://localhost:8787
node test/integracao.mjs      # partida de ponta a ponta contra o servidor local
npx wrangler deploy           # publica o Worker (precisa estar logado na Cloudflare)
```

O site continua no Cloudflare Pages. A página do Zodiac usa o servidor local quando aberta em `localhost`,
e aceita `?servidor=URL` para testar outro endereço. O Worker só aceita pedidos do site e de `localhost`.

## Servidor das salas (Lies)

```bash
cd servidor-lies
npm install
npm test                  # regras do jogo
npx wrangler dev          # servidor local em http://localhost:8787 (a página usa ele quando aberta em localhost)
npx wrangler deploy       # publica o Worker lies-salas
```

A página aceita `?servidor=URL` para testar outro endereço. O Worker só aceita pedidos do site e de `localhost`.
