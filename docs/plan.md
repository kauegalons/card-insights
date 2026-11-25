# Plan: card-insights v1

> O plano de construção, uma task por branch e PR. Escrito em pt-BR; o resto da documentação está em inglês. Todos os exemplos são **fictícios**.

| | |
|---|---|
| **Status** | Draft |
| **Autor** | Kaue Galon |
| **PRD / Spec** | [PRD v1](prd/v1.md) · [Spec v1](spec/v1.md) |
| **Referência de estilo** | [YudiG12/second-brain-mcp](https://github.com/YudiG12/second-brain-mcp): docs (PRD, spec, ADRs, ARCHITECTURE), testes primeiro, CI em todo PR, review com contexto limpo, deploy no merge |
| **Fonte de dados v1** | CSV da fatura do cartão Nubank |

## Como cada task vira uma branch

Cada task é **uma branch e um PR**, criada a partir de `main` atualizada, na ordem das dependências.

1. `git switch main && git pull && git switch -c <branch>`
2. **Commit vermelho:** os testes que descrevem o comportamento, falhando.
3. **Commit verde:** a implementação mínima que faz passar.
4. Refatoração (opcional), `npm run typecheck && npm test` limpos.
5. PR com: o que muda, critérios de aceite marcados, link da ADR (se houver).
6. **Review por um agente com contexto limpo:** só o diff e os docs.
7. Merge em `main` faz o deploy (a partir da T03).
8. Atualizar `CHANGELOG.md` no mesmo PR.

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
- Desconta as ocorrências excluídas pelo usuário (store `dismissed`, ver T15).
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
- `navigator.storage.persist()` na abertura, com o resultado guardado para a UI.
- **Aceite:** testes com `fake-indexeddb`; um backup restaurado é idêntico ao original; `remove` gera tombstone que `list` não mostra e `changedSince` mostra.

## Fase 2: Categorização

### T08 · `feat/categories-and-rules`
- Árvore padrão (categoria → subcategoria), por exemplo:
  - Transporte → Combustível, Apps de corrida
  - Alimentação → Mercado, Hortifrúti, Padaria, Delivery, Restaurante
  - Saúde → Farmácia
  - Educação → Cursos
  - Assinaturas → Software/Nuvem, Jogos
  - Compras → Eletrônicos, Vestuário e calçados
  - Casa e serviços → Telefonia, Consultoria
  - Taxas → IOF, Juros
- Regras: `contains` / `regex` sobre o `merchant`, com prioridade. A primeira que casar vence; o resto fica "Sem categoria".
- **Aceite:** cada comerciante da fixture cai na subcategoria esperada (ex.: Posto Exemplo → Combustível, Dl*Corridas Exemplo → Apps de corrida, Farmacia Exemplo → Farmácia, Loja de Jogos Exemplo → Jogos).

### T09 · `feat/recategorize-and-learn`
- Ao corrigir a categoria de uma transação, cria-se uma regra para aquele comerciante, com a opção de aplicar às transações antigas.
- **Aceite:** depois da correção, uma nova importação do mesmo comerciante já vem categorizada.

## Fase 3: Análise

### T10 · `feat/analysis-engine`
- Totais por categoria e subcategoria, por fatura e por mês.
- Variação contra a fatura anterior; top comerciantes.
- **Parcelas futuras:** quanto já está comprometido nos próximos meses.
- Exclui `payment` de tudo; `refund` abate a categoria.
- **Aceite:** números conferidos à mão contra a fixture.

### T11 · `feat/budget-50-30-20`
- O usuário informa a renda mensal (em `settings`).
- Cada categoria é mapeada para Necessidades, Desejos ou Poupança (editável).
- Mostra o % real contra 50/30/20 e o status (ok / atenção / acima).
- **Aceite:** testes com renda fictícia e limites de borda.

### T12 · `feat/savings-insights`
- Regras explicáveis, sem IA. Cada insight diz o porquê e o valor:
  - assinaturas recorrentes detectadas (mesmo comerciante, valor parecido, todo mês);
  - categoria que subiu mais de X% contra a média de 3 meses;
  - peso das parcelas na renda dos próximos meses;
  - IOF pago no período (custo de compras internacionais);
  - sugestão de quanto daria para guardar se a categoria voltasse à média.
- **Aceite:** cada regra tem um teste com cenário que dispara e outro que não dispara.

## Fase 4: Interface

### T13 · `feat/ui-shell`
- Rotas (`preact-iso`): Painel, Transações, Economia, Importar, Configurações.
- Navegação inferior no celular e lateral no desktop.
- Tema claro e escuro com tokens de design; foco visível; contraste AA.
- **Aceite:** navegação inteira por teclado; Lighthouse Acessibilidade ≥ 95.

### T14 · `feat/ui-import`
- Arrastar e soltar ou escolher o arquivo; prévia das linhas.
- Resumo "X novas, Y já existiam, Z para revisar", com resolução dos itens em revisão.
- **Aceite:** o fluxo completo funciona com a fixture.

### T15 · `feat/ui-transactions`
- Lista com filtros (fatura, categoria, texto), edição da categoria (dispara a T09).
- **Excluir transação** (ex.: compra cancelada que sumiu do CSV), com confirmação e opção de desfazer logo em seguida. A exclusão vale também para itens em revisão.
- **Aceite:** listas longas continuam fluidas no celular; uma transação excluída some dos totais e não volta ao reimportar o mesmo arquivo (a exclusão grava a impressão digital no store `dismissed`, que a dedupe da T06 desconta).

### T16 · `feat/ui-dashboard`
- Gráfico de barras por categoria, tendência mensal, cartões de resumo e parcelas futuras.
- Toda informação de gráfico também existe em tabela (acessibilidade).
- **Aceite:** sem dados, mostra estado vazio com o botão "Importar" e o botão "Ver demo".

### T17 · `feat/ui-savings`
- Página Economia: 50/30/20 e lista de insights da T12.

### T18 · `feat/ui-settings`
- Renda, editor de categorias e regras, backup (exportar/importar), apagar tudo, dia de fechamento da fatura.
- **Backup automático** (ADR 008): no Chrome/Edge desktop, escolher um arquivo uma vez e o app regrava a cada import ou mudança; nos outros navegadores, aviso com download em um toque após cada import e quando o último backup tem mais de 30 dias.
- Mostra se o armazenamento persistente foi concedido; se não, aviso para instalar o app e ligar o backup.

### T19 · `feat/demo-mode`
- Botão "Ver com dados de exemplo": carrega um conjunto fictício e marca a sessão como demo, sem misturar com dados reais.
- **Aceite:** um visitante entende o app sem ter um CSV.

## Fase 5: PWA e qualidade

### T20 · `feat/pwa-offline`
- `vite-plugin-pwa`: manifest, ícones, service worker, instalação na tela inicial, funcionamento offline.
- Convida a instalar depois da primeira importação: no iOS, o app na tela inicial não sofre a exclusão de 7 dias do Safari (ADR 008).
- **Aceite:** instala no Android/iOS e abre sem internet.

### T21 · `test/e2e-and-a11y`
- Playwright: jornada importar → categorizar → painel → economia.
- `@axe-core/playwright` no CI; o PR falha com violação séria.

### T22 · `feat/import-reminder`
- Com o dia de fechamento configurado, o app avisa ao abrir: "sua fatura fechou, importe o CSV".
- Mostra a data da última importação.

## Fase 6 (v2): Sync entre aparelhos

Mapeada para não exigir mudança drástica depois: a T07 já nasce com `updatedAt`, tombstones e repositórios ([ADR 008](adr/008-data-durability-local-first-sync-ready.md)). Tudo cabe no plano gratuito da Cloudflare para um usuário. Começa depois da demo da v1.

### T23 · `docs/adr-sync-backend`
- Novo ADR que substitui o ADR 001: Worker + D1 + Cloudflare Access, criptografia ponta a ponta, last-write-wins por registro.
- **Aceite:** ADR aceito; spec v2 com o protocolo de sync.

### T24 · `feat/sync-crypto`
- Chave derivada da senha do usuário (PBKDF2 ou Argon2) e AES-GCM no navegador (Web Crypto). O servidor só vê `id`, `updatedAt`, `deletedAt` e o texto cifrado.
- **Aceite:** ida e volta cifra/decifra; senha errada falha com erro claro; nenhum campo legível sai do navegador.

### T25 · `feat/sync-api`
- Worker com `GET /changes?since=` e `POST /changes`, D1 com migrações, atrás do Cloudflare Access.
- **Aceite:** testes com D1 local; sem login a API responde 401/403.

### T26 · `feat/sync-engine`
- Envia `changedSince(lastSyncAt)`, recebe as mudanças remotas, aplica last-write-wins por `updatedAt`, propaga tombstones.
- **Aceite:** dois aparelhos simulados convergem para o mesmo estado, inclusive com exclusões e edições concorrentes.

### T27 · `feat/ui-sync`
- Ligar o sync, definir a senha (com aviso: perdeu a senha, perdeu a cópia do servidor), status da última sincronização, desligar.
- **Aceite:** celular e notebook mostram os mesmos meses depois de sincronizar.

## Depois da v1 (fora de escopo agora)

- `feat/nubank-account-pdf-adapter`: extrato da conta em PDF (pdf.js), conciliando o pagamento da fatura como transferência interna.
- Rotina do Claude que lê a fatura do e-mail e prepara o CSV.
- Projeto separado: leitura de notas do mercado por foto.

## Ordem e dependências

```
T00 → T01 → T02 → T03
              ↓
        T04 → T05 → T06 → T07
                          ↓
                    T08 → T09
                          ↓
              T10 → T11 → T12
                          ↓
  T13 → T14 → T15 → T16 → T17 → T18 → T19
                                        ↓
                          T20 → T21 → T22
                                        ↓
                    (demo v1) T23 → T24 → T25 → T26 → T27
```

T04–T12 são TypeScript puro e testável sem UI, então a T13 (shell da UI) pode começar em paralelo logo depois da T03. A seta T12 → T13 vale só para as páginas que consomem a análise (T16, T17).
