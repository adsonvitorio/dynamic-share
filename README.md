# Dynamic Share

Compartilhamento de tela em tempo real direto do navegador — entre com o
Discord, escolha uma sala, aperte "Compartilhar" e qualquer pessoa
autorizada assiste na hora, sem instalar nada.

## Por que esse projeto existe

O Discord bloqueou o compartilhamento de tela para usuários no Brasil. Num
ambiente de trabalho em que a equipe passa o dia inteiro dentro do Discord —
call aberta, conversa rolando — precisar sair para outra ferramenta só para
mostrar a tela quebrava o fluxo o tempo todo.

A versão original desse sistema foi criada para resolver exatamente isso:
ficar na call do Discord conversando e usar esse app só para a imagem da
tela. Essa versão é a reconstrução completa do projeto, com código novo,
identidade visual própria e a mesma ideia central — e, para ficar claro,
**qualquer grupo pode usar**, não é uma ferramenta presa a empresa.

É por isso que aqui não existe microfone: a voz continua no Discord, a tela
vem pra cá. Não é uma limitação técnica — é o desenho do projeto, e é
reforçado na camada de autorização do servidor, não apenas na interface.

> **Aviso sobre áudio — limitação do navegador:** ao compartilhar a tela
> *com áudio* enquanto está numa call do Discord, a captura pega todo o
> som do sistema — inclusive o áudio da própria call. Ou seja: quem está
> assistindo vai **ouvir a própria voz voltando** pela transmissão. Se a
> ideia é ficar na call conversando, compartilhe sem áudio ou escolha a
> aba/janela específica em vez da tela inteira.

## Como funciona

```text
Usuário              Hub                        Sala
   │  login Discord     │                          │
   ├───────────────────►│  lista de salas: quem    │
   │  (OAuth + allowlist)│  está onde, o que está  │
   │                    │  AO VIVO — em tempo real │
   │                    ▼                          │
   │                entra na sala ────────────────►│ conecta no LiveKit
   │                                               │ "Compartilhar" → captura
   │                                               │   a tela → transmite (SFU)
   │                sala acende AO VIVO ◄──────────┤ webhook avisa o server
   │                "Assistir" ───────────────────►│ vídeo aparece no card
   │                                               │ badge "N assistindo"
```

As peças:

- **LiveKit** é o servidor de mídia (SFU). É ele quem distribui o vídeo de
  quem compartilha para quem assiste — o app em si não transporta um frame
  sequer, só decide *quem pode*.
- **Server** (API) cuida de tudo que envolve permissão: login com Discord,
  allowlist, sessão, emissão de token de acesso à sala e presença.
- **Viewer** é a interface web — uma SPA compilada que fala com o server
  por HTTP e com o LiveKit por WebRTC.
- **Presença em tempo real** sem polling: o LiveKit avisa o server a cada
  entrar/sair/publicar (webhook assinado), e o server transmite para
  todos os navegadores abertos via SSE. O hub acende "AO VIVO" sozinho.
- **Contador de viewers**: quem assiste avisa o sharer por data channel,
  e o nome exibido vem sempre da identidade verificada do participante
  (assinada pelo servidor) — nunca do que a mensagem diz ser.

## Regras do sistema

- **Login é só pelo Discord** — sem cadastro, sem senha. Sua identidade é
  a sua conta do Discord.
- **Acesso por allowlist** — só entra quem tem o Discord ID em
  `config/allowlist/allowlist.json`. Editar o arquivo já vale (o server
  recarrega sozinho ao detectar a mudança).
- **Salas são curadas** — definidas em `config/rooms/rooms.json`. Não dá
  pra criar sala pela interface; quem administra o app controla quais
  existem.
- **Uma conexão por conta** — se você entrar na mesma sala em outra aba
  ou dispositivo, a conexão anterior é derrubada e a aba antiga mostra
  o aviso de sala ocupada.
- **Sessão sem banco de dados** — o login vive num cookie cifrado mais um
  registro em memória com snapshot em disco (sobrevive a reiniciar o
  server). Encerrar a sessão derruba a transmissão ativa na hora.
- **Pausa geral** — criar `state/state.json` com `{"paused": true}`
  dentro do diretório de dados coloca o app em manutenção (a API responde
  503 e a UI mostra a tela de pausa). Remova o arquivo e volta ao normal.
- **Sem banco de dados, por decisão** — tudo que o app precisa lembrar
  são sessões e configuração, e isso cabe em arquivos JSON que o server
  observa e recarrega. Menos peça pra instalar, menos coisa pra quebrar.

## Segurança (o que vale saber)

- O **servidor é a autoridade**: identidade, permissões e tokens são
  decididos e assinados lá, nunca no navegador.
- O token que libera a sala **só permite publicar tela e áudio da tela**
  — mesmo que alguém tente conectar direto no LiveKit por fora do app,
  não consegue abrir microfone ou câmera.
- **Logout encerra de verdade**: ao sair (ou a sessão expirar), o
  participante é removido da sala na hora — e se tentar voltar com o
  token antigo, é barrado novamente.
- Mensagens de "estou assistindo" **não carregam identidade** — o
  remetente é sempre validado pelo canal de mídia autenticado, então não
  dá pra fingir ser outra pessoa assistindo.
- Rate limit por rota, CORS fechado para a mesma origem, cookies
  `httpOnly`/`secure`, webhooks com assinatura verificada, e logs
  estruturados que nunca carregam dados pessoais ou tokens.

## Tecnologias

| Papel | Tecnologia | Motivo |
|---|---|---|
| Linguagem | **TypeScript** | mesmo código tipado do server ao viewer |
| API | **Fastify 5** | leve, rápido, valida entrada por schema |
| Mídia | **LiveKit** self-hosted | SFU maduro — qualidade adaptativa, webhook de presença, data channel |
| Interface | **Svelte 5 / SvelteKit** | SPA estática, reatividade direta, pouco boilerplate |
| Validação | **Zod** | todo dado externo (HTTP, env, JSON, cookie) é validado; config inválida impede o boot |
| Estilo | **Tailwind + CSS vars** | tema inteiro controlado por variáveis |
| Deploy | **Docker Compose + Caddy** | stack completa em um arquivo (adaptável à sua infra) |
| Runtime | **Node.js 22+** | |

Monorepo em npm workspaces:

```text
packages/
  shared/    tipos, schemas e limites usados por server e viewer
  server/    API (auth, salas, sessões, tokens, webhook do LiveKit)
  viewer/    SPA — telas de login, hub e sala
config/      rooms.json, allowlist/ — configuração viva do server
docker/      compose, Dockerfiles, Caddyfile, config do LiveKit
```

## Identidade visual

Tema **gamer/neon** original — base quase preta, roxo vibrante de marca,
verde-limão neon e vermelho para o "ao vivo". Fonte Orbitron nos títulos
e Inter no texto. Tudo é variável CSS, então trocar o tema é mexer num
bloco de variáveis, não caçar cores espalhadas.

**Nota:** o logo, o favicon e os ícones temáticos das salas foram gerados
com auxílio de IA.

## Rodando o projeto

Existem dois cenários bem diferentes, e vale separá-los:

- **Rodar local** (dev, testar, usar numa LAN): só precisa de Node 22+ e
  um LiveKit. Nada de domínio, proxy reverso ou HTTPS — `localhost` já é
  contexto seguro pro navegador permitir a captura de tela.
- **Subir em produção**: aí o navegador exige HTTPS, então precisa de
  domínio e certificado. O repo já traz uma stack pronta com Docker
  Compose + Caddy que resolve isso — mas **você não é obrigado a usá-la**.
  Se já tem sua própria infra (nginx, Traefik, Cloudflare Tunnel, o que
  for), a Opção 2 mostra os pontos que precisam ser adaptados.

### Pré-requisito comum: app no Discord

Independente de como você roda, precisa de um app no
[Discord Developer Portal](https://discord.com/developers/applications):

1. Crie uma aplicação (botão *New Application*).
2. Em **OAuth2**, copie o **Client ID** e gere um **Client Secret** —
   vão pro `.env`.
3. Em **Redirects**, adicione a URL de callback:
   - para rodar local:
     `http://localhost:<DEV_VIEWER_PORT>/api/auth/discord/callback`
     (por padrão `5173`, mas se você mudou `DEV_VIEWER_PORT` no `.env`,
     use a sua porta)
   - para produção: `https://seu-dominio.com/api/auth/discord/callback`
4. Pegue seu Discord ID (Modo Desenvolvedor no Discord → clique direito
   no seu perfil → *Copiar ID*) e coloque em
   `config/allowlist/allowlist.json` — sem isso, nem você entra.

### Opção 1 — local, sem Docker

Pré-requisito: **Node.js 22+** instalado.

```bash
git clone <repo> && cd dynamic-share
npm install
cp .env.example .env
```

No `.env`, o mínimo pra subir:

- `SESSION_SECRET` — 64 caracteres hex aleatórios. Gere com
  `openssl rand -hex 32` ou, se não tiver openssl (comum no Windows):
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `DISCORD_CLIENT_ID` e `DISCORD_CLIENT_SECRET` — do passo anterior
- `LIVEKIT_DEV_BIN` — caminho do binário do LiveKit (abaixo)

`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` já vêm com os defaults `devkey`/`secret`
— **em dev não precisa gerar nada**, eles combinam com o modo `--dev` do
livekit-server. Em produção é diferente: são credenciais que você inventa
(o compose injeta o par no LiveKit e no server), então gere as suas.

gere com: openssl rand -hex 16 ou node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

O LiveKit é a única dependência externa em dev, e há duas formas:

1. **Binário** (recomendado): baixe `livekit-server` em
   [github.com/livekit/livekit/releases](https://github.com/livekit/livekit/releases),
   extraia na raiz do projeto e aponte `LIVEKIT_DEV_BIN` pra ele
   (`./livekit-server` ou `./livekit-server.exe` no Windows). O
   `npm run dev` sobe ele junto, já com os webhooks apontados pro server.
2. **Docker**: deixe `LIVEKIT_DEV_BIN` vazio e rode:

   ```bash
   docker run --rm -p 7880:7880 -p 7881:7881 -p 50000-50100:50000-50100/udp \
     livekit/livekit-server:v1.9.12 --dev --config-body "$(printf \
       'keys:\n  "devkey": "secret"\nwebhook:\n  api_key: "devkey"\n  urls:\n    - "http://host.docker.internal:8080/webhook"\n')"
   ```

   Três valores desse comando amarram com o seu `.env` — se mudou algum,
   ajuste aqui também:
   - `devkey`/`secret` = seu `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`
   - `7880` (primeira porta) = `LIVEKIT_DEV_PORT`
   - `8080` (no webhook) = `PORT`, a porta do server local

   No Linux adicione `--add-host=host.docker.internal:host-gateway`.

Depois é só:

```bash
npm run dev        # server na PORT (:8080 por padrão),
                   # interface na DEV_VIEWER_PORT (:5173 por padrão)
```

Se sua versão do npm travar no primeiro workspace, abra dois terminais:
`npm run dev -w server` e `npm run dev -w viewer`.

Acesse **`http://localhost:<DEV_VIEWER_PORT>`** (`5173` por padrão),
faça login pelo Discord e pronto.

### Opção 2 — produção numa VPS

A stack pronta do repo usa Docker Compose com quatro serviços:

- **LiveKit** — transporte de mídia (WebRTC)
- **server** — a API (auth, salas, tokens)
- **viewer** — a interface, servida por um nginx interno
- **Caddy** — a única porta exposta: HTTPS automático, headers de
  segurança e o roteamento de cada caminho pro serviço certo

```bash
cd docker
cp .env.example .env     # preencha: DOMAIN, SESSION_SECRET, DISCORD_*,
                         # LIVEKIT_API_KEY/SECRET (gere os seus, ex:
                         # openssl rand -hex 16), CADDY_EMAIL
                         # CF_API_TOKEN só se for usar o desafio Cloudflare
docker compose up -d --build
docker compose exec -T server wget -qO- http://127.0.0.1:<PORT>/health
                         # <PORT> é a PORT do seu docker/.env (3000 por padrão)
```

O que precisa existir fora do compose:

| Item | Para quê |
|---|---|
| Um domínio apontado pro IP da VPS | HTTPS + callback do Discord |
| Certificado TLS | o Caddy resolve sozinho via ACME — veja a nota do Cloudflare abaixo |
| Portas abertas: **80** e **443** (tcp+udp), **7881** tcp e **50000-50100/udp** | web + mídia WebRTC |
| O callback `https://<domínio>/api/auth/discord/callback` registrado no app Discord | login |

**Sobre o Cloudflare**: o `docker/Caddyfile` que vem no repo emite o
certificado pelo **desafio DNS do Cloudflare** (por isso o
`CF_API_TOKEN` com permissão *Zone → DNS → Edit* no `.env`). Isso foi
escolha prática — emite certificado mesmo com porta 80 fechada ou IP
dinâmico. Se o seu domínio não está no Cloudflare, você tem dois
caminhos:

- **Trocar o desafio**: remova o bloco `tls { dns cloudflare ... }` do
  `Caddyfile` e o Caddy emite via HTTP/TLS-ALPN padrão — basta a porta
  80/443 aberta e o domínio apontado pro servidor.
- **Usar sua própria infra de edge**: se você já tem nginx, Traefik ou
  outro proxy com certificado, pode dropar o serviço `caddy` do compose
  e montar o roteamento equivalente no seu — `/api/*` e `/webhook` vão
  pro `server:3000`, `/rtc*` pro `livekit:7880`, o resto pro
  `viewer:8080`.

**Uma amarração pra conhecer**: o `Caddyfile` aponta pra `server:3000`
de forma fixa. Se mudar `PORT` no `docker/.env`, ajuste o `3000` do
Caddyfile junto (ou deixe o padrão).

> Tudo que envolve **proxy reverso, certificado TLS, CSP e portas de
> firewall é só desse cenário de produção**. Rodando local você ignora
> essa seção inteira.

## Configuração (o que você pode mexer)

Toda variável de ambiente é validada no boot — se faltar ou estiver
errada, o server **não sobe** e diz o que falta, em vez de quebrar em
silêncio depois. Os `.env.example` (raiz para dev, `docker/` para
produção) já vêm comentados com placeholders tipo `<64-hex-chars>`.

O que vive em arquivos, fora do `.env`:

- **`config/rooms/rooms.json`** — as salas. Formato por sala: nome
  técnico (`slug`), nome exibido, descrição e ícone. Salve e o server
  recarrega sozinho.
- **`config/allowlist/allowlist.json`** — lista de Discord IDs
  autorizados. Mesmo esquema: editou, valeu.
- **`DATA_DIR/state/state.json`** — `{"paused": true}` pausa o app.

Nunca commite `.env` nem coloque segredos reais em configurações ou
documentação.

## Desenvolvimento

```bash
npm run typecheck   # tipos + svelte-check nos três pacotes
npm test            # suítes do server e do viewer (vitest)
npm run build       # build completo (shared → server → SPA)
```

Notas para quem vai mexer no código:

- **Sem banco de dados e sem polling** — são decisões, não lacunas. Se
  um dia precisar de qualquer um dos dois, é uma mudança de arquitetura
  pra ser discutida, não um PR pequeno.
- O `livekit-client` está **pinado na 2.22.3** — o refresh de token
  depende de um detalhe interno do SDK. Se atualizar, revise
  `packages/viewer/src/lib/room/connection.svelte.ts` e teste o refresh.
- O projeto todo passou por testes automatizados com navegadores reais
  e uma rodada de pentest (três achados, todos corrigidos) — os
  comportamentos de segurança descritos acima foram verificados na
  prática, não só no papel.
