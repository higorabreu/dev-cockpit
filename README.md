# Dev Cockpit

Terminal estilo Guake para o dia a dia de desenvolvimento: abre e fecha com uma tecla global, tem abas,
um menu de segurar, busca de projetos e um painel com sessões, git e containers.

Versão **0.1.0**: primeira versão para uso real. O que ainda não existe está em
[Limites conhecidos](#limites-conhecidos).

## Instalar para o uso diário

Requisitos para construir: Node 24 (`nvm use`), pnpm 9 e o `dpkg-deb` do sistema (Ubuntu e Debian).

```bash
pnpm install
pnpm install:local         # constrói o pacote .deb e instala (pede a senha do sudo)
```

Isso instala o app em `/opt/dev-cockpit`, cria a entrada **Dev Cockpit** no menu de aplicativos e o
comando `dck`. O padrão da tecla global é **F12**. Para trocar de versão, rode o mesmo comando de novo:

- se o cockpit está aberto, ele **pergunta antes de reiniciar**, porque reiniciar fecha as abas e os
  comandos que rodam nelas;
- `pnpm install:local --no-restart` instala e deixa a versão nova valer na próxima abertura;
- `pnpm install:local --yes` reinicia sem perguntar; `--skip-build` instala o `.deb` já construído.

Para iniciar com o login, marque **Iniciar com o sistema** no menu do ícone da bandeja (vem desligado).
Para remover: `sudo apt remove dev-cockpit`. Os dados ficam em `~/.config/dev-cockpit`.

## Usar

| Tecla | O que faz |
| --- | --- |
| `F12` (configurável) | Mostra ou esconde a janela, no monitor onde está o mouse |
| `F11` | Altura total ou ancorada |
| `Ctrl+Shift+T` / `W` | Nova aba / fechar aba |
| `Ctrl+Tab`, `Ctrl+Shift+Tab` | Próxima / anterior aba |
| `Alt+1` a `9` | Vai para a aba |
| Segurar `Ctrl` direito | Menu em roda: abas, projetos, agente, sistema. Soltar executa |
| `Ctrl+Shift+O` | Busca de projetos (`Ctrl+D` fixa ou solta um favorito) |
| `Ctrl+Shift+B` | Painel lateral |
| `Ctrl+Shift+J` | Vai para a aba que terminou um comando |
| `Ctrl+Shift+↑` `↓` | Opacidade |
| `Ctrl +` `-` `0` | Tamanho da fonte |
| `Ctrl+Shift+L` | Alterna tema claro e escuro |
| `Ctrl+,` | Configurações (também pela engrenagem do painel) |

Selecionar texto copia; o botão direito e o do meio colam. O comando `dck` controla a janela de fora
(`dck toggle`, `dck ping`): útil para ligar a um atalho do sistema se a tecla global for recusada.

## Configurações

`Ctrl+,` abre a tela: língua, tema, opacidade, fonte, altura da janela, tecla global, tecla do menu
de segurar, pasta dos projetos, início com o sistema e o tempo para avisar um comando longo. Tudo vale
na hora. As configurações ficam num `settings.json` que também pode ser editado à mão; campo inválido
volta ao padrão. As variáveis `DCK_KEY`, `DCK_HEIGHT` e `DCK_PROJECTS_ROOT` vencem o arquivo.

## Desenvolver sem atrapalhar o instalado

```bash
pnpm dev                   # constrói e abre; perfil, socket e tecla (F9) próprios, sem ícone na bandeja
pnpm dev:dck toggle        # o CLI do repositório, falando com o cockpit de desenvolvimento
pnpm lint && pnpm typecheck && pnpm test
```

O de desenvolvimento usa `~/.config/dev-cockpit-dev` e o socket `dck-dev`, então convive com o instalado.
O `CLAUDE.md` descreve a arquitetura e os padrões; `plans/` tem o roadmap, as decisões e os planos.

## Limites conhecidos

- Só Linux com X11, testado no Ubuntu 24.04 e no GNOME. macOS e Windows entram depois, como adaptadores.
- O pacote roda com `--no-sandbox`, como o resto do projeto, por causa da restrição de sandbox do Ubuntu.
- Sem o banner de aprovações do Claude e sem o dado do agente no painel (código parado, ver D26).
- Sem Jira e GitLab (Marco 2) e sem remapear os demais atalhos.
- O ícone na bandeja do GNOME abre o menu e não alterna a janela direto.
