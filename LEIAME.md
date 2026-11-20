# Caderno de Cozinha

Receitas, dicas e anotações em arquivos `.md`, com app de busca rápida que
funciona no PC e no celular. Sem banco de dados, sem build, sem dependências.

- **Conteúdo:** uma pasta de textos (`receitas/`), um arquivo por item.
- **App:** serve a pasta e edita os arquivos pela API local.
- **Busca:** por palavra, por ingrediente (`tem:` / `sem:`), por categoria, por favoritos.

## Como rodar

**Duplo clique em `abrir-caderno.cmd`.** Ele sobe o servidor e abre o navegador em
<http://127.0.0.1:8787>. A janela preta que aparece é o servidor: deixe aberta
enquanto estiver usando, feche para desligar.

Pelo terminal, se preferir:

```powershell
node servidor.mjs           # sem abrir o navegador
node servidor.mjs --abrir   # já abre
```

No celular, na mesma rede Wi-Fi:

```powershell
abrir-caderno.cmd --lan
```

O terminal mostra o endereço (`http://192.168.x.x:8787`). Na primeira vez o
Windows pergunta sobre o firewall — permita **rede privada**. No Chrome do
celular, menu → **Adicionar à tela inicial** (vira ícone de app).

Outras opções: `--porta 9000` troca a porta; se a porta estiver ocupada o
servidor avisa em vez de morrer calado.

## O que o app faz

| Ação | Como |
|---|---|
| Buscar | digite; ignora acentos e maiúsculas. `/` foca a busca, `Esc` limpa |
| Buscar por ingrediente | `tem: tomate` · `sem: forno` · `tem: "creme de leite"` |
| Filtrar categoria | chips no topo (clicar de novo desfaz) |
| Favoritar | estrela no cartão ou no item aberto — o ★ do topo mostra o total |
| Só favoritos | clique no ★ do topo; com ele ligado, os números dos chips passam a contar só os favoritos |
| Ver item | clique no cartão |
| Editar | abre o item → **Editar** (formulário + markdown) |
| Criar | **+ Nova** (já vem com o esqueleto de ingredientes e modo de fazer) |
| Anotar | abre o item → **Anotar** (grava data e texto em `## Anotações`) |
| Excluir | abre o item → **Excluir** (vai para `receitas/_lixeira`, reversível) |
| Backup | link **Baixar backup** no rodapé (JSON com tudo) |

## Modo cozinha

Abra o item e toque em **▶ Cozinhar** (`cozinha.html?id=<id>`). A tela fica grande,
com poucos botões, para usar com a mão suja e o celular apoiado.

Diga (ou toque):

| Comando | O que faz |
|---|---|
| **Resumo** | fala tempo, rendimento, quantos ingredientes/passos, o resumo e as últimas anotações |
| **Preparar** / **Executar** | começa a conduzir a receita |
| **Ok**, **Tenho**, **Próximo**, **Pronto** | confirma o ingrediente/passo atual e avança |
| **Repetir** / **Não ouvi** | repete a fala atual |
| **Pular** | pula o item atual |
| **Iniciar** | dispara o cronômetro do passo (quando ele tem tempo) |
| **Aguarde mais 10 minutos** / **Mais 5 minutos** | estende o cronômetro |
| **Anotar** | abre as anotações |
| **Pausar** | cala a voz |
| **Aumenta o volume** / **Abaixa o volume** | volume da voz (20% a 100%) |
| **Mais devagar** / **Mais rápido** | velocidade da leitura (0,6× a 1,6×) |
| **Velocidade normal** | volta a 1,0× |

Os ajustes de voz também estão no **menu do modo cozinha** (botões − / + de
volume e velocidade) e ficam salvos no navegador. O comando funciona em qualquer
tela, por voz ou toque. **Limite honesto:** alguns Androids ignoram o volume por
fala do navegador — a velocidade funciona sempre; para volume, o botão físico do
celular é o que vale.

Ao chegar num passo com tempo ("forno pré-aquecido a 180 °C por 30 min"), a tela
mostra **Pré-aquecer** (10 min) e **Cronômetro de 30 min**. O cronômetro avisa na
metade (e lembra de virar, se o passo pedir) e no fim; aí você pode dizer
"aguarde mais 10 minutos" e ele recomeça. No fim da receita, a tela de anotações
sugere frases prontas ("gostei", "faltou sal"…) e grava em `## Anotações` com a data.

**Limites reais:**

- **Microfone exige https** (ou `localhost`). No celular, por `http://192.168.x.x`,
  ele fica desligado — a tela avisa e você usa os botões. A voz de leitura
  (`speechSynthesis`) funciona mesmo sem https.
- Manter a tela acesa (`wakeLock`) também exige https; sem isso o celular pode apagar.
- O cronômetro conta enquanto a página está aberta. Em segundo plano o navegador
  pode atrasar os avisos — deixe a tela do modo cozinha à vista.
- Receitas sem `## Modo de fazer` só têm a etapa de ingredientes; o app avisa.

## Onde fica o conteúdo

`receitas/<id>.md`, texto puro e legível. O app relê do disco a cada
requisição, então editar o arquivo à mão e recarregar a página basta.

```markdown
---
titulo: Molho tártaro
categoria: Molhos
tempo: 10 min
porcoes: 4 porções
tags: [molho, frio, peixe]
resumo: "Uma frase que aparece no cartão."
fonte: https://exemplo.com/receita
criado: 2026-11-14
atualizado: 2026-11-14
---
## Ingredientes

- 1 xícara de maionese
- 2 colheres de pepino em conserva

## Modo de fazer

1. Misture tudo.

## Anotações

- 14/11/2026 — ficou melhor com pepino em conserva.
```

Regras do formato:

- `titulo`, `categoria`, `tempo`, `porcoes`, `tags`, `resumo`, `fonte` são opcionais
  menos o título (sem ele, vale o primeiro `# Título` do corpo).
- `## Ingredientes` é o que alimenta a busca por ingrediente — mantenha a lista ali.
- `## Anotações` é onde o botão **Anotar** escreve. Pode editar à mão.
- Um item por arquivo; o nome do arquivo é o `id` (minúsculas, sem acento).

## Adicionar de fora do app

Duas formas:

1. Salvar um `.md` novo em `receitas/` com o nome do id. O app passa a mostrá-lo.
2. Jogar os arquivos em `entrada/` e rodar:

```powershell
node ferramentas/importar.mjs --seco   # simulação
node ferramentas/importar.mjs          # importa de verdade
```

O importador lê `.md`, `.markdown`, `.txt` e `.texto`, usa o `# Título` como
título, cria o `.md` formatado em `receitas/` e move o original para
`entrada/_originais/`.

## Estrutura

```
abrir-caderno.cmd    duplo clique: sobe o servidor e abre o app
receitas/            conteúdo (um .md por item)
receitas/_lixeira/   itens excluídos (recuperáveis)
entrada/             depósito para importar (originais ficam em _originais/)
app/                 interface (index.html, app.js, nucleo.js, estilo.css, sw.js)
lib/receitas.mjs     formato: ler, gravar, derivar índices
servidor.mjs         servidor HTTP + API
ferramentas/         migrar-acervo.mjs, importar.mjs, docx-para-md.py, teste.mjs
acervo.js, *.html    versão antiga (v1), só leitura — pode apagar quando quiser
```

## API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/itens` | lista tudo (já com ingredientes e texto normalizado para busca) |
| GET | `/api/itens/:id` | um item |
| POST | `/api/itens` | cria; o id vem do título |
| PUT | `/api/itens/:id` | atualiza |
| DELETE | `/api/itens/:id` | move para `_lixeira` |
| GET | `/api/exportar` | backup `.json` |

## Testes

```powershell
node ferramentas/teste.mjs               # 24 testes de unidade
node ferramentas/teste-cozinha.mjs       # 18 testes do modo cozinha (texto/roteiro)
node ferramentas/teste-dados.mjs         # 10 testes do Drive (cliente + camada)
node ferramentas/teste-tela.mjs          # integração: app.js com DOM falso
node ferramentas/teste-cozinha-tela.mjs  # integração: fluxo cozinha com voz falsa
```

O primeiro cobre formato (ida e volta do frontmatter), derivação de
ingredientes e resumo, busca com `tem:`/`sem:`, contadores, markdown, anotações
e o disco. O de dados usa um Drive falso (sem rede nem conta). Os de tela
iniciam a interface de verdade e conferem os números dos chips/estrela e o
caminho completo do modo cozinha — é o que substitui abrir o navegador.

## Importar do Google Drive

### .docx do Word

```powershell
converter-docx.cmd              # gera os .md em entrada/ (duplo clique também serve)
node ferramentas/importar.mjs   # leva para receitas/
```

O conversor copia o texto **literalmente** — só decide a estrutura: onde começa
cada receita, o que é ingrediente e o que é passo. Títulos e categorias de cada
receita ficam no dicionário `META` no topo do script (é lá que se ajusta quando
um arquivo novo vier com nome diferente).

O `.docx` original vai para `entrada/_originais/`. Para reconverter, copie de
volta para `entrada/` e rode de novo — o importador cria id novo, então apague o
item antigo antes (ele vai para `receitas/_lixeira`, dá para recuperar).

### .md, .txt, Google Docs exportados

1. No Drive, selecione a pasta → **Fazer download** (vem um `.zip`).
2. Extraia dentro de `entrada/`.
3. `node ferramentas/importar.mjs --seco` para conferir, depois sem `--seco`.
4. Abra o app e ajuste o que entrou como **Importados**.

Google Docs: **Arquivo → Fazer download → Markdown (.md)** funciona direto.
`.pdf` e fotos de receita precisam de conversão à parte.

## Limitações de propósito

- O servidor é local: fora de casa o celular não alcança (a fase 3 resolve isso
  lendo a pasta do Drive direto, sem PC ligado).
- Sem login: quem estiver na mesma rede vê o caderno.
- Edição simultânea não tem merge — a última gravação vence.

## Fase 3 — app na nuvem (Drive)

O app pode rodar em https (GitHub Pages) lendo a pasta do Drive, sem PC ligado.
O passo a passo dos cliques está em [DEPLOY.md](DEPLOY.md); a parte de código já
está pronta:

- `app/dados.js` — escolhe a fonte sozinho: se `/api` responder, usa o servidor
  local; senão, o Drive. Dá para forçar com `?fonte=drive` / `?fonte=local`.
- `app/drive.js` — Drive API v3 (listar, baixar, criar, atualizar, lixeira), sem SDK.
- `app/google-auth.js` — login pelo Google Identity Services (token em memória).
- `app/formato.js` — o formato `.md` compartilhado entre Node e navegador.
- `app/config.js` — Client ID e ID da pasta (vazios = modo local).

## Extra (não é do caderno)

`quando-e-barato.mjs` responde em que janela de tarifação a API da DeepSeek está
agora, no fuso do sistema: pico = 01:00–04:00 e 06:00–10:00 UTC de segunda a
sexta (calendário de Pequim, exceto feriados chineses); o resto é metade do preço.

```powershell
node quando-e-barato.mjs            # agora + próximas viradas
node quando-e-barato.mjs --precos   # tabela de preços do deepseek-flash
node quando-e-barato.mjs --teste    # 13 verificações de data
node quando-e-barato.mjs --ajuda
```

Só consulta o relógio — não faz rede, não lê sua conta e não sabe quanto você
gastou. O calendário de feriados chineses embutido cobre 2026; depois disso o
script avisa que está desatualizado.
