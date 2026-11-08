# 🍬 Chiclete English — app real (versão 0.1)

Aprenda inglês com músicas que grudam na cabeça e professores de IA (Teacher Lua e Teacher Anthony) que lembram de você.

Esta pasta é o **app de verdade**: um site que se instala no celular como app (PWA) e tem um **servidor próprio** que conversa com a IA do Claude. Ele não depende mais da sua conta Claude: quem paga a IA é o app, pela sua chave de API.

---

## O que tem aqui

| Arquivo | Para que serve |
| --- | --- |
| `index.html` | O app inteiro: músicas, professores, aulas, missões, meta diária, cards |
| `api/chat.js` | O servidor que fala com a IA. A chave secreta fica **só aqui** |
| `manifest.webmanifest` | Permite instalar na tela inicial do celular |
| `sw.js` | Faz o app abrir rápido e funcionar com internet ruim |
| `icon-192.png`, `icon-512.png` | Ícones do app |

---

## Passo a passo para colocar no ar (sem programar, ~30 minutos)

Você vai precisar de 3 contas gratuitas: **GitHub**, **Vercel** e **Anthropic (Claude API)**.

### 1. Pegue sua chave da API do Claude
1. Acesse **console.anthropic.com** e crie uma conta.
2. Em **Billing**, adicione um cartão e coloque um crédito pequeno (ex.: US$ 5 dá para muitos testes).
3. Em **API Keys**, clique em **Create Key**, dê o nome `chiclete` e **copie a chave** (começa com `sk-ant-`).
   ⚠️ Nunca mostre essa chave para ninguém nem cole no código do app.
4. Recomendado: em **Limits**, defina um limite de gasto mensal (ex.: US$ 10) para não ter surpresa.

### 2. Coloque o código no GitHub
1. Crie uma conta em **github.com**.
2. Clique em **New repository**, nome `chiclete-english`, deixe **Private** e clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Arraste **todos os arquivos desta pasta** (incluindo a pasta `api`) e clique em **Commit changes**.

### 3. Publique na Vercel
1. Crie uma conta em **vercel.com** usando **Continue with GitHub**.
2. Clique em **Add New → Project** e escolha o repositório `chiclete-english` → **Import**.
3. Antes de clicar em Deploy, abra **Environment Variables** e adicione:
   - `ANTHROPIC_API_KEY` = a chave que você copiou no passo 1
   - `ACCESS_CODE` = um código para o teste fechado (ex.: `chiclete2026`). Só quem tiver o código consegue conversar com os professores.
4. Clique em **Deploy**. Em ~1 minuto você recebe um link tipo `chiclete-english.vercel.app`. 🎉

### 4. Instale no celular
- **Android (Chrome):** abra o link → menu ⋮ → **Instalar app**.
- **iPhone (Safari):** abra o link → botão **Compartilhar** → **Adicionar à Tela de Início**.

Na primeira conversa com um professor, o app pede o **código de acesso** (o `ACCESS_CODE`). Mande o link + o código para seus testadores.

### 5. Para atualizar o app depois
Peça as mudanças ao Claude, baixe o arquivo novo e, no GitHub, abra o arquivo → ícone de lápis (ou **Add file → Upload files** para substituir) → **Commit**. A Vercel publica sozinha em ~1 minuto.

---

## Configurações opcionais (Environment Variables na Vercel)

| Variável | Padrão | O que faz |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — (obrigatória) | Sua chave da API do Claude |
| `ACCESS_CODE` | vazio | Se preenchido, exige código para usar os professores (teste fechado) |
| `MODEL_FAST` | `claude-haiku-5-5` | Modelo do modo ⚡ Rápida (barato) |
| `MODEL_MAX` | `claude-sonnet-5-5` | Modelo do modo 🎓 Máxima (~20× mais caro) |
| `OPENAI_API_KEY` | vazio | Recomendado para iPhone. Com ela, o botão 🎤 grava a fala e transcreve no servidor, o caminho mais estável no iPhone. No Android o app usa o reconhecimento do próprio Chrome. Custa centavos por minuto. |

Depois de mudar uma variável, vá em **Deployments → ⋯ → Redeploy**.

---

## Quanto custa
- **Vercel Hobby:** grátis para a fase de testes (não é permitido uso comercial; quando começar a cobrar, mude para o plano Pro, US$ 20/mês).
- **IA:** ~US$ 0,0005 por mensagem no modo Rápida e ~US$ 0,01 no modo Máxima. 50 testadores usando bastante ≈ US$ 8/mês.
- Acompanhe o gasto em **console.anthropic.com → Usage**.

---

## O que mudou em relação ao protótipo
- 🎤 **Microfone de verdade:** no Chrome (Android/PC) e Safari (iPhone) o botão 🎤 transcreve sua fala. O **Modo voz** abre o microfone sozinho depois que o professor fala.
- 🔐 IA no servidor próprio, com chave protegida, limite de tamanho das mensagens e código de acesso opcional.
- 💸 Cache das instruções dos professores (reduz custo) e modo **Rápida** como padrão.
- 📲 Instalável como app e abre mesmo com internet ruim.

## Ainda não tem (próximas fases)
- Login e progresso salvo na nuvem (hoje o progresso fica no aparelho).
- Pagamento (Pix/cartão) e limite de mensagens do plano grátis.
- Nota de pronúncia, músicas cantadas por voz real, apps nas lojas.

## Problemas comuns
- **"Ops, não consegui responder"**: confira se a `ANTHROPIC_API_KEY` está certa e se há crédito na conta Anthropic. Veja os erros em Vercel → seu projeto → **Logs**.
- **Microfone não abre**: o site precisa estar em `https://` (a Vercel já faz isso) e você precisa permitir o microfone no navegador.
- **Pedi o código e errei**: limpe os dados do site no navegador (ou use uma aba anônima) para digitar de novo.
