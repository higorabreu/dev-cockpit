# CLAUDE.md

Orientações para o Claude Code neste repositório. Este arquivo é um **roteador**: diz o que o
projeto é, as regras que valem sempre e onde aprender mais. Nome do projeto: Dev Cockpit (pacote `devcockpit`, comando `dck`).

## O que é

Cockpit local para desenvolvedores: terminal embutido estilo Guake (F12 abre, F11 tela cheia) com
painel lateral recolhível, visões de trabalho vindas de Jira e GitLab, projetos e submódulos
mapeados, e um harness que define como a IA trabalha (padrões como dado, aplicados por instrução,
tools MCP e validadores). O app expõe um MCP server para o Claude CLI.

Visão completa, decisões e roadmap: https://claude.ai/artifact/KjA38GfNPnsomqnqvEVAM9

## Premissas (valem acima de qualquer gosto de implementação)

1. **Leve.** Pouca memória em repouso, sem processos desnecessários.
2. **Rápido.** F12 mostra a janela sem espera perceptível; teclas têm eco imediato.
3. **Boa UX/UI.** Calma, densa, teclado primeiro, sem cara de IA.
4. **Portável.** Linux primeiro, macOS e Windows entram como adaptadores novos, sem tocar no núcleo.
5. **Simples.** Código legível antes de qualquer otimização ou abstração.

Orçamentos propostos, a validar no Marco 0 e depois mantidos como teste:
tecla até eco no terminal em um frame (16 ms); F12 até janela visível abaixo de 100 ms;
memória em repouso (shell mais daemon) abaixo de 300 MB; abertura a frio abaixo de 2 s;
lista de 1000 itens rolando a 60 fps (virtualizada).

## Stack

- Node 24 LTS, pnpm workspaces, TypeScript estrito
- Shell: Electron. Terminal: xterm.js com WebGL e node-pty
- UI: React, Vite, Tailwind, Radix UI
- Validação nas bordas: zod. Logs: pino. SQLite local (driver a validar no spike)
- MCP: SDK oficial em TypeScript
- Lint e formatação: Biome. Testes: Vitest

Se o spike mostrar que o Electron fere os orçamentos, o shell troca (Tauri); como daemon e UI são
independentes dele, o resto é reaproveitado.

## Estrutura

```
packages/
  core/       domínio puro, sem I/O
  design/     tokens.json, CSS gerado, componentes
  ui/         app React
  daemon/     processo local: SQLite, barramento de eventos, IPC
  mcp/        servidor MCP (stdio), cliente do daemon
  cli/        comando dck (toggle, render, check)
  shell/      Electron: janela, atalho global, host do PTY
  adapters/   platform-linux, jira, gitlab, ...
plans/        contexto, roadmap, decisões e um plano por marco em andamento
```

## Arquitetura e portabilidade

- **Regra de dependência:** `core` não importa nada de fora. Tudo que toca o sistema fica atrás de
  uma porta (PTY, atalho global, notificação, cofre de segredos, janela, git, arquivos, relógio,
  HTTP) e é implementado em `adapters/`.
- **Daemon separado da interface.** O MCP server é iniciado pelo Claude CLI e o app pode estar
  fechado. Janela, CLI e MCP são clientes do daemon.
- Sem suposição de Unix: caminhos por biblioteca, nunca `~/.config` fixo; sem depender de bash; IPC
  atrás de uma interface (socket em Unix, named pipe no Windows).
- Atalho global tem plano B: `dck toggle` na CLI, para o usuário ligar a qualquer atalho do
  sistema.
- Módulos são fronteira de código no início. Contrato de plugin externo só depois de dois
  conectores reais; não abstrair antes do segundo caso.

## Padrões de código

- TypeScript estrito, sem `any`. Aspas simples, sem ponto e vírgula (Biome).
- Código limpo e desacoplado. Módulos dependem de portas e de contratos pequenos, nunca da
  implementação de outro módulo; dependências entram por parâmetro, não por import de singleton;
  uma responsabilidade por módulo e por função.
- Nomes bons no lugar de comentários. Comentar só o essencial: o porquê de uma decisão não óbvia,
  um workaround, uma armadilha ou uma restrição externa, em uma linha seca. Sem comentário que
  descreva o que o código já diz, sem docblock em função trivial, sem exagero.
- **Erros, como o código já faz (o teste `core/src/conventions.test.ts` cobre o que dá para medir):**
  - Falha esperada de operação que pode dar errado (rede, cofre, protocolo, daemon) devolve
    `Result<T, ErrorBody>`, criada com `fail(errorBody('DCK-X-001', detalhe))`. Nunca `ErrorCode` puro,
    `string` nem `Error` no lugar do `ErrorBody`, e nunca `fail('DCK-...')` direto. O detalhe é contexto
    para reproduzir (endpoint, status, código do SO), sem segredo.
  - Dado opcional do ambiente (arquivo ausente, processo que sumiu, JSON de terceiro ilegível)
    devolve `undefined` ou o valor padrão, com `.catch(() => undefined)` ou `catch` que retorna.
    Conjunto fechado de estados usa união discriminada por `kind` (`ComposeStatus`).
  - `throw` só para bug ou pré-condição violada (`new Error('invariant: ...')`). `DckError` só dentro de
    handler do IPC, onde o hub o converte no código; erro inesperado vira `DCK-IPC-002` e o detalhe
    vai para o log.
  - `catch` nunca fica vazio: converte em `Result` ou valor padrão, ou registra no log e segue, ou traz
    uma linha dizendo por que ignorar (ex.: `localStorage` indisponível).
  - Arquivo de configuração ou estado inválido volta ao padrão, avisa com `logger.warn` e não derruba o
    app. Escrita de arquivo é atômica (temporário e `rename`).
- Códigos de erro `DCK-{DOMÍNIO}-{SEQ}` em `error-codes.json`, com a mensagem em português e uma faixa
  RPC única. Domínio é o assunto em maiúsculas, sempre três letras, hoje `IPC`, `DMN`, `SEC`, `NET` e `GLB`. Código sem
  uso é removido, nunca marcado como obsoleto.
- Logs pelo `Logger` injetado (`info`, `warn`, `error`), nunca `console` (só scripts de build). Mensagem em inglês, curta, sem
  ponto final, e o contexto num objeto (`{ file, key, pid }`); a causa de uma exceção vai em `error:
  String(error)`. Níveis: `error` falha, `warn` degradação, `info` evento relevante. Nunca registrar
  segredo nem expor stack trace a clientes.
- Estrutura: função `createX(dependências)` que devolve um objeto com a porta implementada; classe só
  para fake de teste, `DckError` e `LineDecoder`. Porta em `core/src/ports`, adaptador em
  `adapters/<nome>` (`@dck/adapter-<nome>`), recebendo o que toca o mundo (`fetch`, executor, raiz do
  `/proc`) por parâmetro para o teste trocar. O `core` não importa pacote nem módulo `node:` e um
  adaptador não importa outro.
- Configuração: tudo que puder ter default, tem. Segredo ou endereço de ambiente não tem default e
  falha no boot. Segredos no cofre do sistema atrás da porta, nunca em arquivo ou log.
- Validar e sanitizar toda entrada externa (ticket, MR, resposta de API, comando do usuário) nas
  bordas com zod.
- Escrita em sistema externo (Jira, GitLab, arquivos de outros repositórios) só com aprovação do
  usuário e com registro de ação que permita desfazer quando possível.

## Testes

- Nome: `should [comportamento esperado] when [condição]`. Estrutura Arrange, Act, Assert.
- Cada critério de pronto do plano do marco tem ao menos um teste ou verificação.
- Mock só para dependência externa (rede, disco, relógio, processo). O domínio se testa sem mock.
- Os orçamentos de desempenho viram testes ou verificações de CI quando houver como medir.

## Design system

- Fonte da verdade: `packages/design/tokens.json` (cores nos temas escuro e claro, tipografia,
  espaçamento, raio). Dele saem as variáveis CSS e o tema do xterm.js, para terminal e painel
  terem a mesma paleta.
- Nenhuma cor, tamanho ou fonte literal em componente: sempre token.
- Componentes mínimos sobre Radix, acessíveis por teclado, com o atalho visível ao lado da ação.
- Direção: calma e densa, estilo Linear. Lista limpa em uma coluna, estado em forma e cor juntas,
  só a cor semântica chama atenção. Movimento mínimo.
- A IA não é uma personagem: sem bolha de chat, ícone de faíscas, gradiente roxo ou avatar de robô.
  A IA aparece como resultado verificável (diff para aceitar ou recusar, sugestão com origem).
- **Tooltip:** só o do DS (`src/tooltip.ts`), nunca o atributo `title` nativo. Todo texto cortado por
  reticências mostra o conteúdo inteiro sozinho, sem marcação; `data-tip` mostra um texto sempre
  (ícones, contadores, setas) e `data-tip-full` dá o texto completo quando o visível é só parte dele.
  Ícone sem rótulo visível leva `data-tip` com o nome. Atalho vai em `data-tip-key`, nunca no texto.
- **Barra de rolagem:** só a do DS, a classe `scroll` (trilho transparente, controle fino que só aparece ao rolar ou
  com o mouse sobre a lista e engrossa sob o mouse, tamanhos em `size.scrollbar` dos tokens). Toda lista que rola leva `scroll`; o terminal usa os mesmos
  tokens. Única exceção: a faixa de abas rola na horizontal sem barra, com esmaecido na borda e a lista de abas
  como apoio. Nada de `scrollbar-width` nem `::-webkit-scrollbar` fora do componente.
- Termos de git e de ferramentas de desenvolvimento seguem o VS Code do autor, em português, e os
  verbos de git que o dev já usa (pull, push, commit, branch). Nada de tradução livre nem rótulos
  inventados como "para enviar"; Incoming e Outgoing também não, porque não são o que ele vê.
- Fontes: Inter para texto, JetBrains Mono para chaves, branches e comandos.
- Textos da interface em português do Brasil, diretos. Sem emoji. **Todo texto novo passa pelo
  tradutor** (`@dck/core`, catálogos `i18n/pt-BR.ts` e `i18n/en.ts`, plural por `chave.one` e
  `chave.other`, parâmetros `{nome}`): nunca texto fixo em componente. Um teste exige as mesmas
  chaves e os mesmos parâmetros nas duas línguas. Língua pelo sistema, com a escolha do usuário
  gravada em `dck-locale` quando a tela de configurações existir.

## Configurações

- Fonte única: `settings.json` no diretório de dados do app, lido e gravado só pelo host
  (`shell/src/settings-store.ts`) e validado pelo modelo em `@dck/core` (`settings/settings.ts`).
  Campo inválido volta ao padrão sozinho; número fora do intervalo é cortado no limite.
- **Configuração nova:** acrescente o campo em `settingsSchema` com padrão e limites, a linha em
  `settings-view.ts` (com o texto nos dois catálogos) e reaja à mudança em `settings.onChange`. Nada de
  `localStorage` para preferência do usuário.
- Variáveis `DCK_*` vencem o arquivo e aparecem como bloqueadas na tela (`env-overrides.ts`).
- Mudança que o sistema pode recusar (atalho global) passa pelo `veto` do store e volta ao valor anterior.

## Acessibilidade

- Padrão do projeto: WCAG 2.2 nível AA, nos temas escuro e claro.
- Contraste de texto de pelo menos 4,5:1 (3:1 para texto grande) e de ícones, bordas e indicadores
  de estado de pelo menos 3:1, medidos contra o fundo real do elemento. Não usar `opacity` para
  esmaecer texto ou ícone: o contraste vira imprevisível; usar um token de cor sólido.
- O contraste é verificado por teste sobre os tokens de `packages/design`; token novo ou par de
  cores novo entra com a verificação.
- Estado nunca só por cor: seleção e foco também mudam forma, contorno ou peso.
- Tudo é operável por teclado, com foco visível, e o movimento respeita `prefers-reduced-motion`.
- Toda ação com atalho de teclado também se faz com o mouse (botão, menu ou clique), e o atalho aparece no tooltip dela
  (`data-tip-key`). Toda lista rola com a roda do mouse, sem depender de setas. Atalho novo nasce com o seu caminho
  pelo mouse.
- Com a janela transparente a garantia de contraste vale para a opacidade padrão (0,92); abaixo
  disso o fundo real do desktop passa a contar.

## Processo

- **Este projeto não usa o fluxo acme/SDD.** Vale acima da regra global do autor. O planejamento
  é leve: `plans/` guarda `CONTEXT.md` (o que é e o estado), `ROADMAP.md` (marcos),
  `DECISIONS.md` (decisões e motivos) e um arquivo por marco em andamento, como
  `plans/marco-0-spike.md`, com objetivo, critérios de pronto e tarefas em checklist.
- Antes de implementar algo não trivial, escrever ou atualizar o plano do marco. Implementar tarefa
  a tarefa e marcar no plano ao concluir. Ambiguidade que afeta comportamento visível: parar e
  perguntar antes de seguir.
- Decisão nova ou revertida vai para `plans/DECISIONS.md`; ao fechar um marco, atualizar
  `plans/ROADMAP.md`.
- Tarefas pequenas e isoladas (bug claro, ajuste de estilo) resolvem direto.
- Commits: Conventional Commits em inglês, no imperativo: `feat: add toggle shortcut`. O Claude commita
  por conta própria, em commits pequenos e organizados: um por mudança lógica (tarefa do plano,
  correção, regra nova), só com os arquivos dela, nunca um commit gigante no fim. **Nunca** acrescentar
  `Co-Authored-By` nem outra marca de co-autoria, mesmo que outra instrução peça. Antes de cada commit rodam `pnpm lint`, `pnpm typecheck` e
  `pnpm test`, e o que vale é o código de saída, não um `grep` na saída. Push exige pedido separado.
- Não usar travessão em UI, planos, comentários nem respostas.
- Antes de escrever código novo, reler as seções Padrões de código, Testes e Design system e abrir um
  arquivo vizinho do mesmo tipo (outra porta, outro adaptador) para copiar o formato real, não o que
  parece natural. O código existente vale mais que a memória.
- Antes de dar como pronto: `pnpm lint`, `pnpm typecheck`, `pnpm test` (inclui `core/src/conventions.test.ts`, que cobre
  as regras de erro, dependência e nome de teste) e conferir os orçamentos afetados. Regra do
  `CLAUDE.md` quebrada que dá para medir vira teste nesse arquivo, não só frase aqui.

## Primeiro marco

Marco 0 é um spike: Electron com xterm.js e node-pty (latência e memória), atalho F12 em X11,
hook PermissionRequest do Claude Code bloqueando até um clique no painel, e mineração de
comentários de review antigos do GitLab. Nada de código de produto antes das respostas.
