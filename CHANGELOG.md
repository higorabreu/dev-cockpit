# Changelog

Formato livre, mais novo primeiro. Versionamento 0.x enquanto o uso real não termina.

## 0.1.0

Primeira versão para uso real (Marco 1). Verificada por testes automáticos e por execução no Electron;
a semana de uso real no lugar do Guake (M1-T11) começa com ela.

### Terminal e janela
- Janela sem moldura que abre no monitor do mouse com a tecla global, altura ancorada ou total (F11)
  com transição, opacidade, tema escuro, claro ou do sistema, e fonte ajustáveis.
- Terminal xterm com cópia ao selecionar, aviso de copiado e colar com o botão direito.
- Abas com menu de contexto, reordenar por arrastar e atalhos de troca.
- Menu em roda para segurar (Ctrl direito, configurável), com seletor de abas por uso recente.

### Projetos
- Varredura da pasta de projetos e dos submódulos, ordem por uso recente e atividade, busca aproximada e
  favoritos fixados.

### Painel
- Trilho de ícones sempre visível e painel recolhível com largura ajustável.
- **Sessões:** estado de todas as abas, aviso e notificação do sistema quando um comando longo termina.
- **Git:** branch, ticket, alterações preparadas, pull e push, submódulos.
- **Ambiente:** containers do compose e o estado de cada um.

### Sistema
- Tela de configurações em overlay, com `settings.json` validado, restaurar padrão e tudo valendo na hora.
- Língua em português e inglês, trocada ao vivo.
- Ícone na bandeja e início com o login (opcional).
- Daemon separado, versionado e substituído sozinho quando fica para trás.
- Pacote `.deb` com o comando `dck`, e `pnpm install:local` para trocar de versão com um comando.

### Medições (orçamentos do projeto)
- Abertura a frio 310 ms, eco de tecla 0,8 ms até a tela e 9,8 ms até o primeiro quadro,
  memória em repouso 218 MB, `dck toggle` empacotado em 56 ms.

### Limites conhecidos
- Sem o banner de aprovações do Claude (M1-T8) e sem dados do agente no painel (código parado, D26).
- Só Linux com X11. Sem Jira e GitLab.
