# Um Jogo Casual

Jogos para a turma jogar na mesma sala, cada um no seu celular (ou passando um celular só).
É um app web instalável: abre no navegador e pode ir para a tela inicial do celular.

## Jogos

### Pabla
Cantarole uma música sem nenhuma palavra e faça seu time adivinhar o artista e o título.

- Modos: Clássico (em times, quem acerta continua), Uma vez por time (sugerido com mais de 15 pessoas) e Corrida (cada um por si).
- Carta com 3 músicas e 1 Desafio, que vale o dobro.
- 40 segundos por música, com apito quando faltam 15 (aí a coreografia está liberada).
- Artista vale 3, título vale 5. Vence quem chegar a 50 pontos.
- Funciona hoje no modo de celular único. Próximos passos: um celular por time e juiz por voz.

O plano completo do jogo está no documento do projeto.

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
| `lies/index.html` | O Lies (telas do jogo; fala com o servidor das salas) |
| `servidor-lies/` | Worker da Cloudflare com as salas do Lies (Durable Objects) e os testes das regras |
| `manifest.webmanifest` | Nome, cores e ícones para instalar na tela inicial |
| `sw.js` | Guarda o app no aparelho para abrir sem internet |
| `icons/` | Ícones do app |
| `_headers` | Regras de cache do Cloudflare Pages |

## Músicas

O pacote Base fica em `index.html`, na constante `PACOTE_BASE`.
Cada música é `[título, artista, trecho da letra]`, com no máximo uma ou duas frases da letra.

## Publicar

O app está no Cloudflare Pages: https://um-jogo-casual.pages.dev

Cada envio para a branch `main` publica sozinho, sem etapa de build (os arquivos da raiz são servidos como estão).
Branches diferentes de `main` ganham um link de prévia próprio.

Depois de mudar algum arquivo do app, aumente `VERSAO` em `sw.js` para os celulares baixarem a versão nova.

## Servidor das salas (Lies)

```bash
cd servidor-lies
npm install
npm test                  # regras do jogo
npx wrangler dev          # servidor local em http://localhost:8787 (a página usa ele quando aberta em localhost)
npx wrangler deploy       # publica o Worker lies-salas
```

A página aceita `?servidor=URL` para testar outro endereço. O Worker só aceita pedidos do site e de `localhost`.
