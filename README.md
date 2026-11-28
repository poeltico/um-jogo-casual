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

## Arquivos

| Arquivo | Para quê |
| --- | --- |
| `index.html` | O app inteiro: menu, Pabla, regras e o pacote Base de músicas |
| `catalogo.js` | Pacotes do catálogo (Sertanejo 90, Pagode 90, Emo e rock 2000, MPB e rock BR) |
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
