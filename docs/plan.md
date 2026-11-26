# Plan: card-insights v1

> O plano de construção, uma task por branch e PR. Escrito em pt-BR; o resto da documentação está em inglês. Todos os exemplos são **fictícios**.

| | |
|---|---|
| **Status** | Draft |
| **Autor** | Kaue Galon |
| **PRD / Spec** | [PRD v1](prd/v1.md) · [Spec v1](spec/v1.md) |
| **Referência de estilo** | [YudiG12/second-brain-mcp](https://github.com/YudiG12/second-brain-mcp): docs (PRD, spec, ADRs, ARCHITECTURE), testes primeiro, CI em todo PR, review com contexto limpo, deploy no merge |
| **Fonte de dados v1** | CSV da fatura do cartão Nubank |
| **Revisão do plano** | 2026-11-25, antes da T08: instâncias self-hosted com nuvem cifrada antes das telas ([ADR 011](adr/011-self-hosted-instances-with-mandatory-e2e-sync.md)), React ([ADR 010](adr/010-react-replaces-preact.md)), assistente via Claude Code ([ADR 012](adr/012-assistant-as-claude-code-commands.md)), limites por categoria |

## Como cada task vira uma branch

Cada task é **uma branch e um PR**, criada a partir de `main` atualizada, na ordem das dependências.

1. `git switch main && git pull && git switch -c <branch>`
2. **Commit vermelho:** os testes que descrevem o comportamento, falhando.
3. **Commit verde:** a implementação mínima que faz passar.
4. Refatoração (opcional), `npm run typecheck && npm test` limpos.
5. PR com: o que muda, critérios de aceite marcados, link da ADR (se houver). PRs pequenos: ~250 linhas de código fora testes; acima disso, divide.
6. **Squash merge** em `main` quando o CI fica verde; o merge faz o deploy (a partir da T03).
7. Atualizar `CHANGELOG.md` no mesmo PR.

**Code review com contexto limpo** (agente `code-reviewer`: só o diff e os docs):

- **ao fechar cada fase**: os achados viram PRs de correção antes da fase seguinte;
- **antes do merge de PRs sensíveis**: storage, backup, sync, criptografia e segurança;
- na Fase 7, também **no meio da fase**, depois da T23.

As tasks seguem em sequência, uma de cada vez, sem frentes paralelas.

Convenção de nomes de branch: `docs/`, `chore/`, `feat/`, `test/`, `fix/`. Código, arquivos e commits em inglês (como na referência). Docs podem ser em português.

**Regra de privacidade em toda task:** nenhum dado real entra no repositório. Testes usam só `test/fixtures/` com dados fictícios.

---

## O que o formato do CSV mostra

```
date,title,amount
2026-10-21,Cafe Exemplo I*Vmt*Cielo,"18,50"
2026-10-06,Pagamento recebido,"- 1.234,56"
2026-10-04,Loja Exemplo - Parcela 3/12,"149,90"
```

| Fato | Impacto no código |
|---|---|
| 3 colunas: `date` (ISO), `title`, `amount` | Adaptador simples; detectar pelo cabeçalho exato |
| Valor em pt-BR, entre aspas, milhar com `.` | Parser próprio; guardar em **centavos inteiros**, nunca float |
| Negativo com espaço: `"- 1.234,56"` | Tratar o sinal separado do número |
| `Pagamento recebido` negativo | É o pagamento da fatura: **transferência interna**, fora dos totais de gasto |
| `- Parcela n/N` no título | Extrair `installment {n, total}` e o comerciante sem o sufixo |
| `IOF de compra internacional` | Categoria Taxas → IOF |
| Mesmo dia + mesmo comerciante + valores diferentes (ex.: duas compras na mesma padaria) | São compras distintas: o valor entra na impressão digital |
| Sem horário e sem ID por linha | Dedup por impressão digital + contagem de ocorrências (T06) |
| Prefixos de adquirente: `Mlp*`, `Wl *`, `Dl*`, `Htm*`, `Pg *` | Normalizar antes de categorizar |
| Nome do arquivo `Nubank_AAAA-MM-DD.csv` | Data de fechamento da fatura → `statementId` |

---

## Fase 0: Fundação

### T00 · `docs/foundation`
Documentação base, no formato da referência.

- `README.md` (o que é, como usar, "deploy your own"), `LICENSE` (MIT), `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md` (modelo de privacidade: tudo no aparelho, nada no servidor).
- `AGENTS.md` + `CLAUDE.md` (`@AGENTS.md`): regras para agentes (testes primeiro, sem dados reais, nomes em inglês).
- `docs/prd/v1.md`: problema, usuário, metas (G1…), não-metas.
- `docs/spec/v1.md`: arquitetura com diagrama Mermaid, modelo de dados, fluxos.
- `ARCHITECTURE.md`: tabela "Concern / How / Decision".
- ADRs em `docs/adr/`:
  - 001 App estático sem backend (dados só no navegador)
  - 002 Preact + Vite + TypeScript strict
  - 003 IndexedDB como armazenamento
  - 004 Hospedagem em Cloudflare Workers Static Assets (alternativa: GitHub Pages)
  - 005 Dinheiro em centavos inteiros
  - 006 Dedup por impressão digital + contagem de ocorrências
  - 007 Categorização por regras editáveis, sem IA
- **Aceite:** todos os links entre docs funcionam; o PRD lista as metas que as tasks abaixo cobrem.

### T01 · `chore/scaffold`
- Vite + Preact + TypeScript `strict`, `.nvmrc` (Node 24), Vitest + `@vitest/ui`.
- Scripts: `dev`, `build`, `preview`, `typecheck`, `test`, `test:ui`.
- Estrutura:
  ```
  src/
    domain/        tipos e regras puras (money, transaction, category)
    import/        adapters/ (nubank-card-csv), dedupe
    categorize/    regras, árvore de categorias
    analysis/      totais, 50/30/20, insights
    storage/       IndexedDB (repositórios)
    ui/            pages/, components/, theme/
  test/
    fixtures/      CSVs FICTÍCIOS
  docs/
  ```
- `.gitignore`: `node_modules`, `dist`, `reports`, `*.csv`, `*.ofx`, `*.pdf`, com exceção de `!test/fixtures/**`.
- **Aceite:** `npm run build` gera `dist/`; um teste de exemplo passa.

### T02 · `chore/ci`
- `.github/workflows/ci.yml` em todo PR: `npm ci`, `typecheck`, `test`, `build`.
- Comentário no PR com o relatório de testes (como a referência).
- **Guarda de privacidade:** um job falha se houver `.csv/.ofx/.pdf` fora de `test/fixtures/`.
- **Aceite:** um PR com um CSV na raiz fica vermelho.

### T03 · `chore/deploy`
- `wrangler.jsonc` com Static Assets (SPA fallback para `index.html`).
- Job `deploy` no push para `main`; URL de preview por PR.
- `docs/setup.md`: como fazer o próprio deploy (fork + token da Cloudflare).
- **Aceite:** o merge em `main` publica; o PR mostra a URL de preview.

## Fase 1: Domínio e importação (TypeScript puro, sem UI)

### T04 · `feat/money-and-dates`
- `parseBrlAmount("1.234,56") → 123456`, `"- 1.234,56" → -123456`, `"60,00" → 6000`.
- `formatBrl(cents)` para exibição.
- Tipos: `Transaction { id, date, rawTitle, merchant, amountCents, kind, installment?, categoryId?, statementId, fingerprint }`.
- `kind`: `purchase | refund | payment | fee`.
- **Aceite:** testes para milhar, negativo com espaço, valores inválidos (erro claro).

### T05 · `feat/nubank-card-csv-adapter`
- Interface `ImportAdapter { id; detect(file): boolean; parse(text, meta): ParsedRow[] }`.
- Adaptador `nubank-card-csv`: detecta pelo cabeçalho `date,title,amount`.
- Extrai `Parcela n/N`; tira o sufixo do `merchant`.
- `Pagamento recebido` → `payment`; `IOF…` e `Juros…` → `fee`; valor negativo que não é pagamento → `refund`.
- Normaliza prefixos (`Mlp*`, `Wl *`, `Dl*`, `Htm*`, `Pg *`, `I*Vmt*Cielo`).
- `statementId` a partir do nome do arquivo (`Nubank_AAAA-MM-DD.csv`) ou, sem ele, da data mais recente.
- **Aceite:** a fixture fictícia (mesmo formato do CSV real) vira as linhas esperadas; um CSV de outro formato não é detectado.

### T06 · `feat/import-dedupe`
- `fingerprint = date + merchantNormalizado + amountCents + installment`.
- **Contagem de ocorrências:** se o arquivo tem 3 iguais e o banco tem 2, entra 1.
- **Possível alteração:** mesmo `date + amountCents`, título diferente → status `review`.
- Desconta as ocorrências excluídas pelo usuário (store `dismissed`, ver T22).
- Retorna `ImportSummary { added, existing, review }`.
- **Aceite (casos de teste):**
  - reimportar o mesmo arquivo → `added: 0`;
  - duas compras legítimas iguais no mesmo dia → as duas ficam;
  - importação parcial e depois a fatura fechada → só as novas entram, mesmo quando o arquivo parcial não tem a data de fechamento no nome;
  - parcela 9/12 e 10/12 do mesmo comerciante → são diferentes.

### T07 · `feat/storage-indexeddb`
- Biblioteca `idb`. Stores: `transactions`, `imports`, `rules`, `categories`, `settings`, `dismissed`.
- Versão de esquema com migrações.
- Backup: exportar e importar tudo em JSON (todas as stores, `dismissed` incluída); apagar todos os dados.
- **Pronto para sync** ([ADR 008](adr/008-data-durability-local-first-sync-ready.md)): repositórios com `get`, `list`, `put`, `remove`, `changedSince`; todo registro com `id` UUID, `updatedAt` e `deletedAt?` (exclusão vira tombstone); `settings.deviceId`.
- `requestPersistentStorage()` (`navigator.storage.persist()`) pronto e testado. Chamar na abertura do app e guardar o resultado ficou para a T20 (abertura) e a T25 (exibição).
- **Aceite:** testes com `fake-indexeddb`; um backup restaurado é idêntico ao original; `remove` gera tombstone que `list` não mostra e `changedSince` mostra.

## Fase 2: Categorização

### T08 · `feat/categories-and-rules`
- Árvore padrão de dois níveis (categoria → subcategoria), com as quatro categorias novas da revisão:
  - Transporte → Combustível, Apps de corrida, Estacionamento e pedágio, Transporte público
  - Alimentação → Mercado, Hortifrúti, Padaria, Delivery, Restaurante
  - Moradia → Aluguel e condomínio, Energia, água e gás, Manutenção e móveis
  - Saúde → Farmácia, Consultas e exames
  - Educação → Cursos, Livros
  - Assinaturas → Software/Nuvem, Jogos, Streaming
  - Compras → Eletrônicos, Vestuário e calçados
  - Casa e serviços → Telefonia e internet, Consultoria
  - Lazer e viagem → Passagens, Hospedagem, Passeios e eventos, Bares
  - Pets e cuidados pessoais → Pet shop e veterinário, Beleza, Academia
  - Presentes e doações → Presentes, Doações
  - Taxas → IOF, Juros, Anuidade
- **Categorias editáveis:** criar, renomear e apagar (categoria ou subcategoria). Apagar pede para onde vão as transações e as regras que apontam para ela (outra categoria ou "Sem categoria"); nada fica apontando para uma categoria apagada. As padrão também podem ser editadas.
- Regras: `contains` / `regex` sobre o `merchant`, com prioridade. A primeira que casar vence; o resto fica "Sem categoria". Regras padrão para comerciantes brasileiros comuns (sem IA, [ADR 007](adr/007-editable-rules-for-categorization-without-ai.md)).
- **Aceite:**
  - cada comerciante da fixture cai na subcategoria esperada (ex.: Posto Exemplo → Combustível, Dl*Corridas Exemplo → Apps de corrida, Farmacia Exemplo → Farmácia, Loja de Jogos Exemplo → Jogos, Pet Shop Exemplo → Pet shop e veterinário);
  - criar, renomear e apagar com reatribuição têm testes; apagar não deixa transação nem regra órfã.

### T09 · `feat/recategorize-and-learn`
- Ao corrigir a categoria de uma transação, ela fica `categorySource: 'manual'` e nasce uma regra de usuário para aquele comerciante, acima das padrão.
- O app **pergunta** se aplica às transações antigas do mesmo comerciante ("Aplicar às N transações anteriores?"); só aplica com o sim, e nunca sobre escolhas manuais.
- **Aceite:** depois da correção, uma nova importação do mesmo comerciante já vem categorizada; a contagem N da pergunta exclui as manuais; com "não", as antigas ficam como estavam.

## Fase 3: Análise

### T10 · `feat/analysis-engine`
- **Dois períodos:** fatura (padrão) e mês do calendário. `Period = { kind: 'statement', statementId } | { kind: 'month', month: 'YYYY-MM' }`.
- Totais por categoria e subcategoria no período; variação contra o período anterior (fatura anterior ou mês anterior); top comerciantes; tendência mensal.
- **Parcelas futuras:** quanto já está comprometido nos próximos meses.
- Exclui `payment` de tudo; `refund` abate a categoria.
- **Aceite:** números conferidos à mão contra a fixture, nos dois períodos; uma fatura que atravessa dois meses soma o mesmo total nos dois cortes.

### T11 · `feat/budget-and-limits`
- **50/30/20 editável:** renda mensal e percentuais em `settings` (padrão 50/30/20; os três somam 100). Cada categoria é mapeada para Necessidades, Desejos ou Poupança (editável).
- **Limites por categoria:** valor mensal em centavos por categoria, editável no app e preenchido pelo `/organizar` (T17). Store `limits` (migração do esquema), registro sincronizado.
- Status para grupos do 50/30/20 e para limites: `ok`, `warning` a partir de **80%** e `over` acima de **100%** (limiares em `settings`, ajustáveis).
- **Aceite:** testes com renda fictícia e as bordas (79/80/100/101%); percentuais que não somam 100 são rejeitados com erro claro; categoria sem limite não tem status.

### T12 · `feat/savings-insights`
- Regras explicáveis, sem IA. Cada insight diz o porquê e o valor:
  - assinaturas recorrentes detectadas (mesmo comerciante, valor parecido, todo mês);
  - categoria que subiu **mais de 30% sobre a média de 3 meses e pelo menos R$ 50** (os dois limiares em `settings`, ajustáveis);
  - categoria em atenção ou acima do limite (T11);
  - peso das parcelas na renda dos próximos meses;
  - IOF pago no período (custo de compras internacionais);
  - sugestão de quanto daria para guardar se a categoria voltasse à média.
- **Aceite:** cada regra tem um teste com cenário que dispara e outro que não dispara (inclusive +30% com menos de R$ 50, que não dispara).

## Fase 4: Nuvem (antes das telas)

Cada pessoa roda a **própria instância** (fork + Cloudflare próprio) e só o dono loga nela. O sync é **obrigatório em todo deploy** e entra antes das telas, para que as telas já nasçam sobre ele ([ADR 011](adr/011-self-hosted-instances-with-mandatory-e2e-sync.md)). Visitantes usam o app em modo local; nuvem e assistente exigem o login do dono. A T07 já deixou o storage pronto ([ADR 008](adr/008-data-durability-local-first-sync-ready.md), [ADR 009](adr/009-sync-clock-and-record-identity.md)). Tudo cabe no plano gratuito da Cloudflare para um usuário. Todos os PRs desta fase são sensíveis: code review antes do merge.

### T13 · `docs/adr-sync-backend`
- ADR do protocolo, dentro do que o ADR 011 decidiu: Worker + D1 atrás do **Cloudflare Access só com o e-mail do dono**, cifra ponta a ponta no navegador com **chave de recuperação**, last-write-wins por registro com o relógio e a identidade do [ADR 009](adr/009-sync-clock-and-record-identity.md).
- Pontos que o ADR precisa fechar:
  - **Settings locais × sincronizadas.** `statementClosingDay`, `monthlyIncomeCents`, percentuais do 50/30/20 e limiares (80/100, +30%/R$ 50) passam a ser registros sincronizados, com `id`, `updatedAt`, `updatedBy` e `deletedAt?`; `deviceId`, `lastStampAt` e `lastSyncAt` continuam só do aparelho (o backup já os deixa de fora).
  - **Regra de época** (*epoch*): `deleteAllData` e `restoreBackup` limpam as stores sem tombstones; no próximo sync o servidor devolveria tudo. Um contador de época da conta, incrementado ao apagar tudo ou restaurar e guardado no servidor; mudanças de uma época anterior são descartadas, e um aparelho numa época antiga recomeça do zero em vez de reenviar o que tem.
  - **Chaves:** senha → chave que embrulha a chave dos dados; a chave de recuperação, mostrada uma vez na ativação, embrulha a mesma chave; trocar a senha não recifra os dados. Se a chave fica só na memória ou é guardada no aparelho.
  - **Como o comando do Claude Code se autentica** na API atrás do Access (ex.: `cloudflared access` ou um service token guardado só na máquina do dono).
  - Rotas: API no mesmo Worker do app (caminho `/api/*` atrás do Access) ou num Worker separado.
- **Aceite:** ADR aceito; spec com o protocolo de sync, incluindo os pontos acima.

### T14 · `feat/sync-crypto`
- Web Crypto: chave derivada da senha (PBKDF2 ou Argon2, definido na T13), AES-GCM por registro, chave dos dados embrulhada pela senha e pela chave de recuperação.
- O servidor só vê `id`, `updatedAt`, `updatedBy`, `deletedAt`, a época e o texto cifrado.
- **Aceite:** ida e volta cifra/decifra; senha errada falha com erro claro; a chave de recuperação abre os dados e permite definir uma senha nova; nenhum campo legível sai do navegador.

### T15 · `feat/sync-api`
- Worker com `GET /changes?since=` e `POST /changes`, D1 com migrações, época da conta, atrás do Cloudflare Access (política: só o e-mail do dono).
- `docs/setup.md`: criar o D1, a aplicação do Access com o seu e-mail e os bindings, no mesmo passo a passo do deploy.
- **Aceite:** testes com D1 local; sem login a API responde 401/403; uma mudança de época anterior é recusada.

### T16 · `feat/sync-engine`
- Envia `changedSince(cursor)`, onde o cursor é o maior `updatedAt` já enviado (nunca o relógio de parede), recebe as mudanças remotas, aplica last-write-wins por `(updatedAt, updatedBy)`, propaga tombstones e sobe `lastStampAt` até o `updatedAt` remoto mais novo ([ADR 009](adr/009-sync-clock-and-record-identity.md)).
- Aplica a regra de época: apagar tudo ou restaurar sobe a época; um aparelho numa época antiga recomeça do servidor.
- Migração do esquema: as settings sincronizadas viram registros (T13); `backupFileHandle` e `lastBackupAt` saem (o backup automático em arquivo acabou, ADR 011).
- **Aceite:** dois aparelhos simulados convergem para o mesmo estado, inclusive com exclusões e edições concorrentes; depois de apagar tudo num aparelho, o outro não ressuscita os dados.

## Fase 5: Assistente (comandos do Claude Code)

O app não tem IA ([ADR 007](adr/007-editable-rules-for-categorization-without-ai.md)). O assistente são **comandos do Claude Code** que o dono roda no próprio clone, com o plano Pro, sem API da Anthropic ([ADR 012](adr/012-assistant-as-claude-code-commands.md)). Os comandos falam com a nuvem do dono pelo mesmo protocolo do app e cifram/decifram localmente.

### T17 · `feat/assistant-organize`
- `/organizar` (`.claude/commands/`): pede a senha, lê e decifra os dados da nuvem, analisa com o motor da Fase 3 e **grava direto na nuvem**, cifrado, como registros sincronizados:
  - regras novas para comerciantes sem categoria (`origin: 'assistant'`);
  - **limites por categoria** (`source: 'assistant'`), que o usuário pode editar no app;
  - um **plano** do mês: meta de guardar, onde cortar (categoria, valor, porquê), projeção dos próximos meses e como melhorar no próximo mês.
- Store `plans` (migração do esquema), sincronizada como as outras.
- Mostra o que vai gravar e pede confirmação antes; a senha não é gravada nem aparece no log.
- **Aceite:** com uma nuvem local de teste e dados fictícios, o comando grava regras, limites e plano válidos (validados como no restore); depois do sync o app mostra os mesmos registros; senha errada para sem gravar nada.

### T18 · `feat/assistant-invest`
- `/investir`: monta o perfil (reserva de emergência, prazo, tolerância a risco) com perguntas, compara opções de renda fixa e variável com as **taxas atuais buscadas na web** na hora (com a fonte e a data), e sugere uma divisão do valor a guardar (informado ou a meta do último plano).
- Aviso fixo: é educação financeira, **não é consultoria nem recomendação**. Não guarda carteira nem acompanha posições.
- **Aceite:** o comando cita a fonte e a data de cada taxa; o aviso aparece em toda resposta; nada é gravado na nuvem.

## Fase 6: Design

### T19 · `docs/prototype`
- Protótipo **navegável** das telas da Fase 7 (Painel, Transações, Economia, Importar, Configurações) com dados fictícios: paleta, tipografia, tokens de tema claro e escuro, navegação no celular e no desktop, os 4 gráficos do Painel com as tabelas.
- **Aceite:** o usuário aprova o protótipo antes da T20; os tokens aprovados viram o tema da T20.

## Fase 7: Telas (React)

UI em React ([ADR 010](adr/010-react-replaces-preact.md)) sobre o protótipo aprovado. **Code review no meio da fase, depois da T23**, além do review ao fechar a fase.

### T20 · `feat/ui-shell`
- Rotas (React Router ou equivalente pequeno, escolhido no PR): Painel, Transações, Economia, Importar, Configurações.
- Navegação inferior no celular e lateral no desktop; tema claro e escuro com os tokens da T19; foco visível; contraste AA.
- Na abertura: `openDatabase` (com `onBlocked`: aviso para fechar a outra aba do app) e `requestPersistentStorage()`, com o resultado guardado em memória para a T25 mostrar (vem da T07). Com a nuvem ativa, desbloqueia (conforme a T13) e sincroniza.
- Seletor de período: fatura (padrão) ou mês.
- **Aceite:** navegação inteira por teclado; Lighthouse Acessibilidade ≥ 95; o pedido de armazenamento persistente acontece uma vez por abertura.

### T21 · `feat/ui-import`
- Arrastar e soltar ou escolher o arquivo; prévia das linhas.
- Uma linha inválida bloqueia o arquivo, com a mensagem `Linha N: <motivo>`.
- Resumo "X novas, Y já existiam, Z para revisar", com resolução dos itens em revisão.
- **Aceite:** o fluxo completo funciona com a fixture.

### T22 · `feat/ui-transactions`
- Lista com filtros (período, categoria, texto), edição da categoria (dispara a T09, com a pergunta sobre as antigas).
- **Excluir transação** (ex.: compra cancelada que sumiu do CSV), com confirmação e opção de desfazer logo em seguida. A exclusão vale também para itens em revisão.
- **Aceite:** listas longas continuam fluidas no celular; uma transação excluída some dos totais e não volta ao reimportar o mesmo arquivo (a exclusão grava um registro por ocorrência no store `dismissed`, com a impressão digital, que a dedupe da T06 desconta; [ADR 009](adr/009-sync-clock-and-record-identity.md)).

### T23 · `feat/ui-dashboard`
- Cartões de resumo e **4 gráficos**: gasto × limite por categoria (com atenção 80% e acima 100%), tendência mensal, parcelas futuras e top comerciantes.
- Toda informação de gráfico também existe em tabela (acessibilidade).
- **Aceite:** sem dados, mostra estado vazio com o botão "Importar" e o botão "Ver demo"; cada gráfico tem a tabela equivalente.

> **Code review no meio da fase** (T20–T23), antes da T24.

### T24 · `feat/ui-savings`
- Página Economia: 50/30/20 com os percentuais configurados, insights da T12 e o **plano do assistente** (o último gravado pelo `/organizar`: meta, cortes, projeção, próximo mês).
- **Aceite:** sem plano, a página explica como gerar um com o `/organizar`.

### T25 · `feat/ui-settings`
- **Ativar a nuvem** (só com o login do dono): definir a senha, mostrar a **chave de recuperação** uma vez (com confirmação de que foi guardada), status da última sincronização, trocar a senha.
- Renda, dia de fechamento, **percentuais do 50/30/20**, limiares (80/100, +30%/R$ 50).
- **Categorias** (criar, renomear, apagar), regras e **limites por categoria**.
- Exportar e importar backup (opcional, sem avisos com a nuvem ativa), apagar tudo (sobe a época, T16).
- Mostra se o armazenamento persistente foi concedido (o resultado guardado na abertura, T20); sem nuvem e sem persistência, sugere ativar a nuvem ou instalar o app.
- **Aceite:** celular e notebook mostram os mesmos meses depois de ativar a nuvem nos dois; a chave de recuperação abre a nuvem num aparelho novo.

### T26 · `feat/demo-mode`
- Botão "Ver com dados de exemplo": carrega um conjunto fictício e marca a sessão como demo, sem misturar com dados reais e sem sincronizar.
- **Aceite:** um visitante entende o app sem ter um CSV.

## Fase 8: PWA e qualidade

### T27 · `feat/pwa-offline`
- `vite-plugin-pwa`: manifest, ícones, service worker, instalação na tela inicial, funcionamento offline.
- Convida a instalar **depois da primeira importação**: no iOS, o app na tela inicial não sofre a exclusão de 7 dias do Safari.
- **Aceite:** instala no Android/iOS e abre sem internet; o convite não aparece antes da primeira importação.

### T28 · `test/e2e-and-a11y`
- Playwright: jornada importar → categorizar → painel → economia, e ativar a nuvem → sincronizar com uma API local.
- `@axe-core/playwright` no CI; o PR falha com violação séria.

### T29 · `feat/import-reminder`
- Com o dia de fechamento configurado, o app avisa ao abrir, **só depois do fechamento**: "sua fatura fechou, importe o CSV". Nenhum outro lembrete.
- Mostra a data da última importação.
- **Aceite:** antes do fechamento, ou com a fatura já importada, nada aparece.

## Demo v1

Fecha a Fase 8 com o code review da fase e a demo da v1.

## Depois da v1 (fora de escopo agora)

- `feat/nubank-account-pdf-adapter`: extrato da conta Nubank em PDF (pdf.js), conciliando o pagamento da fatura como transferência interna.
- **Outros bancos e cartões** (CSV/OFX): um `ImportAdapter` por formato, abertos a contribuição.
- **IA opcional no app** via Workers AI, na instância do dono (exige um ADR novo; hoje o app não tem IA, ADR 007 e ADR 012).
- Rotina do Claude que lê a fatura do e-mail e prepara o CSV.
- Projeto separado: leitura de notas do mercado por foto.

## Ordem e dependências

```
T00 → T01 → T02 → T03
              ↓
        T04 → T05 → T06 → T07
                          ↓
                    T08 → T09                      Fase 2
                          ↓
              T10 → T11 → T12                      Fase 3
                          ↓
        T13 → T14 → T15 → T16                      Fase 4 (nuvem)
                          ↓
                    T17 → T18                      Fase 5 (assistente)
                          ↓
                         T19                       Fase 6 (protótipo aprovado)
                          ↓
  T20 → T21 → T22 → T23 → review → T24 → T25 → T26 Fase 7 (telas)
                                                ↓
                          T27 → T28 → T29          Fase 8
                                    ↓
                                (demo v1)
```

Tudo em sequência, uma task por vez. A nuvem (Fase 4) vem antes das telas para que importar, transações e configurações já nasçam sincronizadas; o assistente (Fase 5) depende da nuvem e da análise; o protótipo (Fase 6) é aprovado antes de qualquer tela.
